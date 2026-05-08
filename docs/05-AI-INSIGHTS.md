# 05 — Camada de Insights por IA

## Princípios
1. **Específica** — nunca "performance está boa". Sempre número + comparação + janela.
2. **Acionável** — todo insight HIGH/CRITICAL tem `recommendation` clara.
3. **Concisa** — `title` ≤ 80 chars; `body` ≤ 300 chars.
4. **Honesta** — se variação está dentro da margem de erro, IA cala a boca.
5. **Não-causal** — só correlações com aviso ("X coincide com Y", nunca "X causou Y").

## Tipos de insight

### `ANOMALY` — variação fora da banda esperada (>15% e fora de sazonalidade)
Exemplos:
- "CTR do CTA hero caiu de 8.2% pra 5.4% nas últimas 24h"
- "CPC da campanha `direito5-launch` saltou 47% (R$ 4.20 → R$ 6.20)"
- "Tráfego orgânico do Direito 5.0 dobrou — checar referência da OAB"

### `OPPORTUNITY` — algo que merece olhar
- "CTA `final` converte 2.3x mais que `header` — considerar reduzir o header"
- "Meta Ads tem CPC R$ 2.10 vs Google R$ 6.40 — realocar 30% do budget?"
- "Tráfego de `partner=oab-sp` tem CTR 3x maior — escalar parceria?"

### `SUMMARY` — digest periódico
- **Diário 07h** (BRT): resumo do dia anterior por produto
- **Semanal segundas 07h**: resumo da semana com top 3 destaques + 3 atenções

### `FORECAST` — projeção
- "Ao ritmo atual, Direito 5.0 atinge 50% de capacidade na sexta"
- "Budget Google Ads acaba dia 14/05 se ritmo se mantiver"

## Pipeline

```
┌────────────────────────────────────────────────────────┐
│  Cron 1h: /api/cron/ai-insights                         │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────┐
│ buildContext()     │  Pra cada produto ativo:
│                    │  - últimos 7d de snapshots agregados
│                    │  - deltas dia/dia, hora/hora
│                    │  - insights anteriores não-ack (24h)
└──────┬─────────────┘
       │
       ▼
┌──────────────────────┐
│ Anthropic SDK call   │  model: claude-sonnet-4-6
│ system: prompt fixo  │  cache: system + product config
│ user: contexto JSON  │  response_format: JSON estruturado
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Validate + dedup     │  contextHash = sha256(productId+title+YYYY-MM-DD)
│                      │  se já existe → skip
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Insert into Insight  │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ severity ≥ HIGH ?    │  Sim → enfileirar push + email
└──────────────────────┘
```

## Prompt esqueleto (`prompts/insights.md`)

```markdown
Você é o IRIS, analista sênior de marketing digital do TechNow Hub.
Recebe métricas dos últimos 7 dias de uma Landing Page e a config do produto.

Sua função:
- Detectar variações relevantes (>15%) que NÃO sejam ruído sazonal
- Comparar canais e identificar oportunidades de realocação de budget
- Sugerir ações específicas, baseadas em números

Regras inflexíveis:
- Responda SEMPRE em JSON no schema fornecido — nada antes ou depois
- Se nada for relevante, retorne {insights: []}
- title ≤ 80 chars; body ≤ 300 chars
- Cite o número específico e a janela ("últimas 24h", "vs semana passada")
- NÃO afirme causalidade. Use "coincide com", "associa-se a"
- NÃO repita insight com o mesmo contextHash
- Severity:
  - INFO: bom de saber, não exige ação
  - WARN: vale checar essa semana
  - HIGH: precisa ação em ≤ 48h
  - CRITICAL: precisa ação agora
- Categorias: ANOMALY | OPPORTUNITY | SUMMARY | FORECAST

Schema de resposta:
{
  "insights": [
    {
      "severity": "INFO" | "WARN" | "HIGH" | "CRITICAL",
      "category": "ANOMALY" | "OPPORTUNITY" | "SUMMARY" | "FORECAST",
      "title": string,
      "body": string,
      "recommendation": string | null,
      "metricsRefs": [snapshotId, ...]
    }
  ]
}
```

User message (montado pelo `buildContext()`):
```json
{
  "product": {
    "name": "Direito 5.0",
    "url": "https://direito5.technowhub.ai",
    "active_since": "2026-05-07"
  },
  "metrics_last_7d_daily": [...],
  "metrics_last_24h_hourly": [...],
  "channels_breakdown": [...],
  "cta_position_breakdown": [...],
  "previous_insights_unacked": [...]
}
```

## Modelo
- **Default**: `claude-sonnet-4-6`
  - Rápido, barato, suficiente pra anomalias e summaries
- **Pesados** (forecast, atribuição multi-canal): `claude-opus-4-7`
  - Disparado sob demanda, não por cron padrão

## Prompt caching
- System prompt e config de produto são estáveis → marcar `cache_control: ephemeral`
- Reduz custo em ~80% nas chamadas repetidas dentro da janela de 5min

## Anti-padrões (evitar)
- ❌ "Performance está estável" — se não tem nada relevante, retorna `[]`
- ❌ "Recomendamos otimizar campanhas" — vago, inútil
- ❌ Inventar números quando dado faltou — retornar campo nulo
- ❌ Repetir mesmo alerta sem nova info — dedup por hash
- ❌ Recomendar parar campanha inteira sem >3d de evidência

## Notificações

### Web Push
- Disparo: `severity ≥ HIGH` recém-criado
- Payload: `{title, body, url: "/insights/{id}"}`
- TTL: 1h (se usuário offline >1h, vira email)

### Email (Resend)
- Disparo: severity HIGH/CRITICAL ou digest diário
- Template: HTML simples, identidade IRIS, link direto pro insight
- Daily digest 07h: resumo dos últimos 24h

### WhatsApp (futuro, pós-MVP)
- Z-API ou Twilio
- Só CRITICAL

## Métricas da própria IA (meta)
Trackear no banco:
- Tempo de resposta médio Claude
- % de insights `acknowledged` (taxa de relevância)
- % de insights por severity (controle de "alarmismo")
- Custo USD/mês de chamadas
