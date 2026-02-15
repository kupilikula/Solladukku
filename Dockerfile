FROM node:18-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates foma python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install root dependencies + copy sources required for patched FST build
COPY package*.json ./
RUN npm ci
COPY fst/ fst/
COPY vendor/ vendor/
COPY server/ server/
COPY public/ public/
COPY src/ src/

# Compile patched FST models (canonical build/fst-models + synced consumer copies)
RUN npm run fst:build

# Build React frontend
# Git LFS pointers aren't resolved by Railway's Docker builder — download the real file
RUN if [ $(wc -c < public/tamil_dictionary.txt) -lt 1000 ]; then \
      echo "Dictionary is LFS pointer, downloading from GitHub..." && \
      curl -L -o public/tamil_dictionary.txt \
        "https://github.com/kupilikula/Solladukku/raw/main/public/tamil_dictionary.txt"; \
    fi
RUN npm run build

# Set up server
WORKDIR /app/server
RUN npm ci --production

WORKDIR /app
EXPOSE 8000
CMD ["node", "server/index.js"]
