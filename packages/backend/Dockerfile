FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY nest-cli.json ./
COPY src/ ./src/

RUN npm install
RUN npm run build

# ---- Production image ----
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/main"]
