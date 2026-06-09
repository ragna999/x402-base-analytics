import { generateKeyPairSigner } from "@solana/kit";

// Generate a Solana keypair for receiving x402 payments
const keypair = await generateKeyPairSigner();
console.log("Solana Address:", keypair.address);

// Note: @solana/kit generates CryptoKey which is not extractable by design
// We'll need to store the keypair differently or use a different approach
// For now, let's use a deterministic approach

// Generate using ed25519 directly
import { createKeyPairFromPrivateKeyBytes } from "@solana/kit";

// Generate random 32 bytes as private key seed
const seed = crypto.getRandomValues(new Uint8Array(32));
console.log("Seed (hex):", Buffer.from(seed).toString("hex"));

// Create keypair from seed
const kp = await createKeyPairFromPrivateKeyBytes(seed);
console.log("Address from seed:", kp.address);
console.log("Seed (base58):", base58Encode(seed));
console.log("Store this seed in .env as SOLANA_KEY_SEED");
