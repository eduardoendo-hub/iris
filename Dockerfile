FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Inclui prisma CLI + cliente p/ rodar `migrate deploy` no boot do container
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# migrate deploy garante schema em dia toda vez que o container sobe.
# Idempotente: pula migrations ja aplicadas. Independe de Pre-deploy do Coolify.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
