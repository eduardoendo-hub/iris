# IRIS — Segurança e Autenticação

Documenta o esquema de autenticação do IRIS + rotação de secrets.

## ⚠️ HOJE O COCKPIT TÁ ABERTO PRA INTERNET

A env `IRIS_PUBLIC_PREVIEW=true` está bypassando toda a autenticação no `proxy.ts`.
**Pra fechar agora**:

1. Coolify → app `iris` → Environment Variables
2. **REMOVE** ou seta `IRIS_PUBLIC_PREVIEW=false`
3. Redeploy
4. Configura Google OAuth (passos abaixo) ANTES, senão ninguém consegue logar.

## Camadas de proteção

| Camada | Quem usa | Como autentica |
|---|---|---|
| **UI (cockpit, analytics)** | Pessoas via browser | Google OAuth → sessão NextAuth, com filtro por domínio de e-mail |
| **Cron jobs** | Coolify Scheduled Tasks | header `X-Cron-Secret: $CRON_SECRET` |
| **Admin endpoints** | cURL / scripts / Claude Code | header `X-Admin-Secret: $IRIS_WEBHOOK_SECRET` |
| **Webhooks (Engaged/RD)** | Plataformas externas | HMAC-SHA256 (Engaged Svix) ou Bearer token (RD) |
| **LP events** | navegador do visitante | CORS rigoroso (`ALLOWED_ORIGINS`), sem auth (público) |

## Setup completo (Google OAuth + middleware)

### 1. Criar OAuth app no Google Cloud Console

1. Acessa https://console.cloud.google.com → cria projeto novo (ou usa existente)
2. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `IRIS Cockpit`
5. **Authorized JavaScript origins**:
   - `https://iris.technowhub.ai`
6. **Authorized redirect URIs**:
   - `https://iris.technowhub.ai/api/auth/callback/google`
7. Clica **Create** → copia `Client ID` e `Client Secret`

### 2. Setar envs no Coolify

No app `iris` → Environment Variables, adiciona:

```bash
# Auth Google
GOOGLE_CLIENT_ID=<seu-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<seu-client-secret>

# NextAuth session secret (gera um aleatório: openssl rand -hex 32)
NEXTAUTH_SECRET=<hex-64>
NEXTAUTH_URL=https://iris.technowhub.ai

# Domínios autorizados a logar (separados por vírgula)
ALLOWED_EMAIL_DOMAINS=impacta.com.br,technowhub.ai
```

Salva e **Redeploy** o app.

### 3. Valida o setup

```bash
curl -s -H "X-Admin-Secret: $IRIS_WEBHOOK_SECRET" \
  https://iris.technowhub.ai/api/admin/products \
  | python3 -m json.tool | grep "has_"
```

Esperado: todas as 4 envs novas com `true`:
- `has_nextauth_secret: true`
- `has_google_client_id: true`
- `has_google_client_secret: true`
- `has_allowed_email_domains: true`

### 4. Promover o primeiro admin

Quando você logar pela primeira vez via Google, vira `role: VIEWER`. Pra virar admin, precisa rodar manualmente no DB:

```bash
# Via Prisma Studio ou direto via SQL (Coolify postgres)
UPDATE "User" SET role = 'ADMIN' WHERE email = 'seu@email.com';
```

(No futuro: criar endpoint admin com primeiro-user-auto-admin, ou via página de gestão de usuários.)

## Rotação de secrets

### Quando trocar

- **`IRIS_WEBHOOK_SECRET`**: se alguém da sua equipe sair com acesso, ou suspeita de vazamento
- **`CRON_SECRET`**: idem
- **`NEXTAUTH_SECRET`**: trocar invalida TODAS as sessões (todo mundo precisa relogar — útil em incidente)
- **`GOOGLE_CLIENT_SECRET`**: se vazar, criar nova credencial no Google Cloud Console e atualizar

### Como trocar `IRIS_WEBHOOK_SECRET` (a "senha admin")

1. **Gera um novo** (64 chars hex):
   ```bash
   openssl rand -hex 32
   ```

2. **Atualiza no Coolify**:
   - Environment Variables → `IRIS_WEBHOOK_SECRET` → cola o novo valor

3. **Atualiza nos Scheduled Tasks do Coolify** que usam `$IRIS_WEBHOOK_SECRET`:
   - Cron `daily-insight` (se você configurou via admin secret)
   - Outros que referenciem a env

4. **Atualiza onde mais usa** (deve ser só máquina local pra cURL):
   - `~/.zshrc` ou similar onde tem `export IRIS_WEBHOOK_SECRET=...`

5. **Redeploy** o app pra aplicar.

6. **Valida**:
   ```bash
   curl -s -H "X-Admin-Secret: $NOVO_SECRET" \
     https://iris.technowhub.ai/api/admin/products | jq '.total'
   ```
   Deve retornar `1`. Se retornar `401 unauthorized`, env ainda não propagou.

## Rotas e o que protege cada uma

| Rota | Protegida por | Acesso público? |
|---|---|---|
| `/` (cockpit) | Sessão NextAuth (via middleware) | ❌ exige login |
| `/analytics` | Sessão NextAuth | ❌ |
| `/login` | público | ✅ |
| `/api/auth/*` | NextAuth handlers | ✅ (handshake OAuth) |
| `/api/health` | público | ✅ (healthcheck Coolify) |
| `/api/events` | CORS (`ALLOWED_ORIGINS`) | ✅ via LP whitelisted |
| `/api/webhook/engaged` | HMAC-SHA256 ou Bearer | ✅ via Engaged platform |
| `/api/webhook/rd` | Bearer token | ✅ via RD CRM |
| `/api/cron/*` | `X-Cron-Secret` | ❌ requer header |
| `/api/admin/*` | `X-Admin-Secret` | ❌ requer header |
| `/api/captacao`, `/api/sales` | (atualmente público) | ⚠️ deveria exigir sessão (frente futura) |

## Limitações conhecidas / próximos passos

- **`/api/captacao`, `/api/sales`, etc** não exigem auth ainda — qualquer um com URL pode chamar. Frente futura: adicionar verificação de sessão.
- **Roles `OPERATOR` e `VIEWER` não são distinguidas** em nenhum endpoint. Tudo logado vê tudo.
- **Sem audit log** — não sabemos quem regerou insight, quem disparou ingest. Adicionar `actor_user_id` nas mutações importantes.
- **Sem rate-limit** nos endpoints públicos (`/api/events`, `/api/webhook/*`). Em campanha grande, considerar Cloudflare ou rate limit local.

## Detalhes do middleware

`middleware.ts` na raiz do projeto roda a cada request. Lógica:

1. Se path é público (lista fixa em PUBLIC_PATHS) → libera
2. Se não tem `req.auth` (sessão NextAuth) → redirect 302 pra `/login?from=<path-original>`
3. Senão → libera

Matcher exclui assets estáticos (`_next/*`, `.png`, `.svg`, etc) por performance.
