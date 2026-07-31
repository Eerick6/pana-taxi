# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production=false

COPY . .
RUN npm run build

# ── Stage 2: production ──────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Solo dependencias de producción
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Artefacto compilado del stage anterior
COPY --from=builder /app/dist ./dist

# Firebase service account (Railway lo inyecta como variable o archivo)
# Si usas GOOGLE_APPLICATION_CREDENTIALS como env var, este COPY es opcional
COPY --from=builder /app/firebase-service-account.json ./firebase-service-account.json

EXPOSE 3000

CMD ["node", "dist/main.js"]
