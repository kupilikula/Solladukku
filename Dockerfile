FROM node:18-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates foma && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build React frontend
COPY package*.json ./
RUN npm ci
COPY public/ public/
# Git LFS pointers aren't resolved by Railway's Docker builder — download the real file
RUN if [ $(wc -c < public/tamil_dictionary.txt) -lt 1000 ]; then \
      echo "Dictionary is LFS pointer, downloading from GitHub..." && \
      curl -L -o public/tamil_dictionary.txt \
        "https://github.com/kupilikula/Solladukku/raw/main/public/tamil_dictionary.txt"; \
    fi
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
