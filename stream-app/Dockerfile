FROM node:20-alpine AS spa-build

WORKDIR /app

COPY package.json package-lock.json* .npmrc ./
RUN npm ci

COPY frontend/ ./frontend/
RUN npm run build:spa

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* .npmrc ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY --from=spa-build /app/src/public/spa ./src/public/spa

EXPOSE 8080

CMD ["node", "src/server.js"]
