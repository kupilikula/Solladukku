FROM node:18-slim

WORKDIR /app

# Build React frontend
COPY package*.json ./
RUN npm ci
COPY public/ public/
COPY src/ src/
RUN npm run build

# Set up server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --production
COPY server/ .

WORKDIR /app
EXPOSE 8000
CMD ["node", "server/index.js"]
