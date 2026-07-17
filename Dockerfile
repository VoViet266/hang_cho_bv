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


EXPOSE 3002

# Start command
CMD ["npm", "start"]
