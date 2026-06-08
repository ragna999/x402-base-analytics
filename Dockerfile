FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY src/ ./src/

ENV NODE_ENV=production

EXPOSE 4022

CMD ["node", "src/mcp-server.js"]
