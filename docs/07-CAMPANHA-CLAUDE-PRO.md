# 07 — Campanha Curso Claude Pro (lançamento 11/05 → 06/06/2026)

Primeira campanha Impacta a entrar no IRIS. Serve como template para futuras LPs Impacta
(Direito 5.0 já está coberto no `00-VISION` como produto TechNow; este é o **primeiro
produto Impacta** sendo monitorado pelo IRIS).

## Produto

- **slug:** `claude-pro`
- **name:** Curso Claude Pro
- **url:** `https://impacta.com.br/claude` (LP standalone HTML React)
- **utmCampaignPrefix:** `claude-pro`

## Campanha ativa

- **slug:** `claude-pro-maio-2026`
- **período:** 2026-05-11 → 2026-06-06
- **meta:** 30 matrículas
- **mídia:** R$ 9.000 (40% Meta prospecting, 14% Meta remarketing, 26% Google Search alta intenção, 7% Google Search complementar, 3% Google remarketing, 10% reserva)
- **CAC máx:** R$ 300
- **ROAS alvo:** 5,0×
- **CPL alvo:** R$ 32–36
- **Conversão lead → matrícula alvo:** 11–12%

## Fluxo de captura de Lead

```
Visitante → LP (impacta.com.br/claude)
            │
            ├─ "Garantir vaga"      → checkout → Purchase (Pixel/GA4)
            ├─ "Falar com especialista" → POST integracao-rd → RD CRM (Deal no funil "Curso Claude Pro")
            └─ "Falar pelo WhatsApp"   → POST integracao-rd (whatsapp-click) → IRIS
                                         │
                              ┌──────────┴──────────┐
                              v                     v
                         RD CRM (vendas)      IRIS Webhook
                                              POST /api/webhook/rd
                                                   │
                                                   v
                                              Lead model (Prisma)
```

## Webhook que alimenta este produto

`POST /api/webhook/rd` — aceita 2 eventos do `integracao-rd`:

- `lead.created`   → `Lead.eventType = FORM_SUBMIT`
- `whatsapp.click` → `Lead.eventType = WHATSAPP_CLICK`

Assinado via HMAC-SHA256 com `IRIS_WEBHOOK_SECRET`. O microserviço `integracao-rd` envia o
header `X-Iris-Signature` com o digest do body.

## Métricas que o cockpit deve mostrar (próximas iterações)

Além das KPI cards padrão (Visitas/Cliques CTA/CTR/Custo), adicionar para `claude-pro`:

- **Leads totais** (FORM_SUBMIT + WHATSAPP_CLICK)
- **Leads → Matrículas** (Conversão funil)
- **CAC realizado** (custo total / matrículas)
- **ROAS realizado**
- **% atingimento da meta** (matrículas / 30)
- **Distribuição por persona** (Gestor / Analista / Operações / Consultor / Transição)
- **Tempo médio de primeira resposta** (lead criado → primeiro contato comercial)

## Personas (do plano de marketing)

1. Gestor / líder de área
2. Analista financeiro / trader / dados
3. Backoffice / Operações / TI
4. Empreendedor / consultor
5. Profissional em transição / crescimento

## Referências externas

- Plano de marketing completo: `~/Library/Mobile Documents/com~apple~CloudDocs/IMPACTA/Curso Claude/Plano de marketing atualizado para a Formação Claude Pro.docx`
- Plano visual de execução: `~/Library/Mobile Documents/com~apple~CloudDocs/IMPACTA/Curso Claude/PLANO-EXECUCAO.html`
- Briefing da agência (copys + lotes): `~/Library/Mobile Documents/com~apple~CloudDocs/IMPACTA/Curso Claude/BRIEFING-AGENCIA.md`
- Repositório integracao-rd: `~/integracao-rd/` (Python+FastAPI, deploy Coolify em `rd.impacta.com.br`)

## Pendências para a primeira fase de coleta

1. Token API do RD CRM + funnel_id + deal_stage_id (define em `integracao-rd/app/campaigns/registry.py`)
2. Property ID do GA4 da impacta.com.br/claude (pra GA4 ingest)
3. Customer ID Google Ads
4. Ad account ID Meta
5. URL final do checkout (vai no botão "Garantir vaga" da LP)
6. `IRIS_WEBHOOK_SECRET` definido em ambos integracao-rd e IRIS (mesmo valor)
