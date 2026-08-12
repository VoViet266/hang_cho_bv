FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl

# Set working directory
WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json ./
RUN npm install --production

# Copy Prisma schema and generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the application
COPY . .


# Force IPv4 DNS resolution for Node.js fetch (undici) - fixes Azure TTS timeout in Docker
ENV NODE_OPTIONS=--dns-result-order=ipv4first

EXPOSE 3002

# Start command
CMD ["npm", "start"]
