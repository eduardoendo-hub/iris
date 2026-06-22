FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Aumenta o heap do Node so no build — `next build` estoura o default em
# instancias com pouca RAM (Coolify), morrendo com SIGKILL/exit 255 antes de
# imprimir erro. So afeta esta etapa; o runtime (stage runner) nao herda.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/scripts ./scripts
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Migration NAO roda no boot — quebrou container em prod.
# Aplicar 1x manual via Coolify Terminal: npx prisma migrate deploy
# (ou seguir os passos em docs/MIGRATION.md)
#
# --no-network-family-autoselection: desliga o "Happy Eyeballs" do Node 20+
# (autoSelectFamily). Em containers com IPv6 quebrado isso causa
# "Invalid response body ... Premature close" ao falar com hosts dual-stack
# como oauth2.googleapis.com (Google Ads OAuth). Forca conexao sequencial (IPv4).
# --dns-result-order=ipv4first reforca priorizando IPv4 na resolucao DNS.
CMD ["node", "--no-network-family-autoselection", "--dns-result-order=ipv4first", "server.js"]
