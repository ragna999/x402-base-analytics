// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@aave/v3-core/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/v3-core/contracts/interfaces/IPoolAddressesProvider.sol";

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface ISwapRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

contract FlashLoanArb is FlashLoanSimpleReceiverBase {
    address public owner;
    
    // Base Mainnet addresses
    address constant UNISWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address constant AERODROME_ROUTER = 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43;
    
    // Common tokens
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    
    uint256 constant FLASH_LOAN_FEE = 5; // 0.05% = 5/10000
    
    // Trade direction: true = buy on Aerodrome, sell on Uniswap
    //                  false = buy on Uniswap, sell on Aerodrome
    struct ArbParams {
        address tokenBorrow;    // Token to borrow (e.g., USDC)
        address tokenTrade;     // Token to trade (e.g., WETH)
        uint256 amountBorrow;   // Amount to borrow
        bool buyOnAerodrome;    // true = Aerodrome first, false = Uniswap first
        uint24 uniswapFee;      // Uniswap pool fee tier (3000 = 0.3%)
        uint256 minProfit;      // Minimum profit to execute
    }
    
    event ArbExecuted(
        address indexed tokenBorrow,
        address indexed tokenTrade,
        uint256 amountBorrowed,
        uint256 profit
    );
    
    constructor(address _addressesProvider) 
        FlashLoanSimpleReceiverBase(_addressesProvider) 
    {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    /**
     * @notice Execute flash loan arbitrage
     * @param params ArbParams struct with trade parameters
     */
    function executeArb(ArbParams calldata params) external onlyOwner {
        // Request flash loan from Aave
        POOL.flashLoanSimple(
            address(this),          // receiver
            params.tokenBorrow,     // asset
            params.amountBorrow,    // amount
            abi.encode(params),     // params to pass to executeOperation
            0                       // referralCode
        );
    }
    
    /**
     * @notice Callback from Aave flash loan
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address /* initiator */,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(POOL), "Caller must be pool");
        
        ArbParams memory arbParams = abi.decode(params, (ArbParams));
        
        uint256 amountOwed = amount + premium;
        uint256 balanceBefore = IERC20(asset).balanceOf(address(this));
        
        // Step 1: Approve and swap on first DEX
        IERC20(asset).approve(
            arbParams.buyOnAerodrome ? AERODROME_ROUTER : UNISWAP_ROUTER,
            amount
        );
        
        uint256 intermediateAmount;
        if (arbParams.buyOnAerodrome) {
            intermediateAmount = _swapOnAerodrome(
                asset, 
                arbParams.tokenTrade, 
                amount
            );
        } else {
            intermediateAmount = _swapOnUniswap(
                asset, 
                arbParams.tokenTrade, 
                amount,
                arbParams.uniswapFee
            );
        }
        
        // Step 2: Approve and swap back on second DEX
        IERC20(arbParams.tokenTrade).approve(
            arbParams.buyOnAerodrome ? UNISWAP_ROUTER : AERODROME_ROUTER,
            intermediateAmount
        );
        
        uint256 finalAmount;
        if (arbParams.buyOnAerodrome) {
            // Bought on Aerodrome, sell on Uniswap
            finalAmount = _swapOnUniswap(
                arbParams.tokenTrade,
                asset,
                intermediateAmount,
                arbParams.uniswapFee
            );
        } else {
            // Bought on Uniswap, sell on Aerodrome
            finalAmount = _swapOnAerodrome(
                arbParams.tokenTrade,
                asset,
                intermediateAmount
            );
        }
        
        // Step 3: Check profit
        uint256 profit = finalAmount > amountOwed ? finalAmount - amountOwed : 0;
        require(profit >= arbParams.minProfit, "Not profitable enough");
        
        // Step 4: Repay flash loan (Aave auto-deducts from this contract)
        IERC20(asset).approve(address(POOL), amountOwed);
        
        emit ArbExecuted(asset, arbParams.tokenTrade, amount, profit);
        
        return true;
    }
    
    /**
     * @notice Swap on Uniswap V3
     */
    function _swapOnUniswap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 fee
    ) internal returns (uint256 amountOut) {
        IUniswapV3Router.ExactInputSingleParams memory params = IUniswapV3Router
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0, // We check profit after both swaps
                sqrtPriceLimitX96: 0
            });
        
        amountOut = IUniswapV3Router(UNISWAP_ROUTER).exactInputSingle(params);
    }
    
    /**
     * @notice Swap on Aerodrome (Solidly-style DEX)
     * Uses low-level call since Aerodrome has different interface
     */
    function _swapOnAerodrome(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        // Aerodrome swap function signature: swap(uint256 amountIn, uint256 amountOutMin, address[] path, address to)
        // For simplicity, we use a direct pool swap approach
        
        // Get pool address from factory
        address pool = _getAerodromePool(tokenIn, tokenOut);
        require(pool != address(0), "No Aerodrome pool");
        
        // Approve pool
        IERC20(tokenIn).approve(pool, amountIn);
        
        // Determine token ordering
        address token0 = IERC20(pool).balanceOf > 0 ? tokenIn : tokenOut; // simplified
        
        // Execute swap on pool directly
        // Aerodrome pools have swap(uint256 amount0Out, uint256 amount1Out, address to, bytes data)
        bool isToken0In = tokenIn < tokenOut;
        uint256 reserveIn;
        uint256 reserveOut;
        
        (uint256 r0, uint256 r1, ) = IReserves(pool).getReserves();
        if (isToken0In) {
            reserveIn = r0;
            reserveOut = r1;
        } else {
            reserveIn = r1;
            reserveOut = r0;
        }
        
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
        
        // Transfer tokens to pool first
        IERC20(tokenIn).transfer(pool, amountIn);
        
        // Call swap on pool
        uint256 amount0Out = isToken0In ? 0 : amountOut;
        uint256 amount1Out = isToken0In ? amountOut : 0;
        
        ISwapPool(pool).swap(amount0Out, amount1Out, address(this), "");
    }
    
    function _getAerodromePool(address tokenA, address tokenB) internal view returns (address) {
        // Aerodrome factory: 0x420DD381b31aEf6683db6B902084cB0FFECe40Da
        (bool success, bytes memory data) = 0x420DD381b31aEf6683db6B902084cB0FFECe40Da.staticcall(
            abi.encodeWithSignature("getPool(address,address,bool)", tokenA, tokenB, false)
        );
        if (!success || data.length < 32) return address(0);
        return abi.decode(data, (address));
    }
    
    /**
     * @notice Withdraw profits
     */
    function withdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance");
        IERC20(token).transfer(owner, balance);
    }
    
    /**
     * @notice Withdraw ETH
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH balance");
        payable(owner).transfer(balance);
    }
    
    receive() external payable {}
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

interface ISwapPool {
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
}

interface IReserves {
    function getReserves() external view returns (uint256, uint256, uint256);
}
