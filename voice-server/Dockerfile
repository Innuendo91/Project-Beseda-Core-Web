FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpcap0.8 libudev1 libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* .npmrc ./
RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 4001
EXPOSE 40000-40100/udp

CMD ["node", "src/index.js"]
