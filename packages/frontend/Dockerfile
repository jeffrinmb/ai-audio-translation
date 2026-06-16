FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY next.config.mjs ./
COPY postcss.config.js ./
COPY tailwind.config.ts ./
COPY src/ ./src/
COPY public/ ./public/

ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_LIVEKIT_URL

ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL

RUN npm install
RUN npm run build

# ---- Production image ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["npm", "run", "start"]
