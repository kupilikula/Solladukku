FROM node:18-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates foma python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install root dependencies and the checksum-pinned morphology runtime.
COPY package*.json ./
RUN npm ci
COPY morphology.lock.json ./
COPY scripts/verify_morphology_lock.py scripts/verify_morphology_lock.py
COPY server/ server/
COPY public/ public/
COPY src/ src/

# Refuse to deploy if the checked-in FST release differs from its manifest.
RUN npm run fst:verify-release

# Build React frontend. The compact dictionary is a regular checked-in file.
RUN npm run build

# Set up server
WORKDIR /app/server
RUN npm ci --production

WORKDIR /app
EXPOSE 8000
CMD ["node", "server/index.js"]
