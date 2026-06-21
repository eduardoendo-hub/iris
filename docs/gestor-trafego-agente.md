# Gestor de Tráfego IA — desenho da feature

**Visão:** um "gestor de tráfego pago" que, todo dia (e sob demanda), olha **todas as
campanhas ativas** (Meta + Google), entende os números com cabeça de mídia (ver
[gestor-trafego-playbook.md](../lib/agent/knowledge/gestor-trafego-playbook.md)) e
entrega **"o que fazer hoje"** em ações priorizadas e concretas — incluindo **análise
de palavras-chave** (performando / desperdiçando / a graduar). É advisory: o agente
**recomenda**, o humano executa.

## Arquitetura (reaproveita ~70% que já existe)
| Camada | Status | O que é |
|---|---|---|
| Ingestão Meta/Google | ✅ existe | `lib/ingest/meta-ads.ts` + `google-ads.ts` (spend/impr/cliques por dia, por campanha) |
| Eventos da LP | ✅ existe | `/api/events` → VisitEvent (lp_view, clicks, lead) |
| Agente Claude + conhecimento | ✅ existe | `lib/agent/generate-insight.ts` + `knowledge/*` |
| **Registro de campanhas (tela)** | 🆕 | move o `metaCampaignFilter`/`googleCampaignFilter` do código → DB + UI |
| **Ingestão nível keyword/anúncio** | 🆕 | GAQL keyword-level (Google) + ad-level (Meta) p/ dicas cirúrgicas |
| **Agente de carteira (digest)** | 🆕 (evolui o atual) | cruza TODAS as campanhas → lista priorizada de ações |
| **Tela ADM "Gestor de Tráfego"** | 🆕 | feed "o que fazer hoje" + visão cross-campanha |

## Modelo de dados (Prisma — proposto)
```prisma
model TrackedCampaign {
  id            String   @id @default(cuid())
  platform      String   // "META" | "GOOGLE"
  accountId     String   // ad account / customer id
  externalId    String?  // id da campanha na plataforma (preciso)
  nameFilter    String?  // alternativa: filtro por nome (compat metaCampaignFilter)
  productSlug   String?  // vincula ao produto IRIS (opcional)
  label         String   // nome amigável exibido
  objective     String?  // tráfego | conversão | ...
  targetCpl     Decimal? @db.Decimal(15,2)  // meta de CPL p/ as regras
  targetRoas    Decimal? @db.Decimal(8,2)
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  @@unique([platform, accountId, externalId])
}

model AgentRecommendation {
  id            String   @id @default(cuid())
  date          DateTime            // dia da análise (SP)
  scope         String              // "PORTFOLIO" | "CAMPAIGN" | "KEYWORD"
  platform      String?             // META | GOOGLE
  campaignRef   String?             // externalId/nome da campanha
  entityRef     String?             // keyword / ad / adset alvo
  priority      String              // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  category      String              // "PAUSE" | "SCALE" | "REALLOCATE" | "BID" | "NEGATIVE" | "CREATIVE" | "ALERT"
  problem       String              // com o número que justifica
  action        String              // a recomendação concreta
  expectedImpact String?            // impacto esperado
  evidence      Json?               // métricas que embasam (spend, cpl, ctr, ...)
  status        String   @default("OPEN") // OPEN | DONE | DISMISSED
  createdAt     DateTime @default(now())
  @@index([date, priority])
}
```
> ⚠️ Migração de schema em produção → fazer com `prisma migrate` controlado + backup. Não rodar no automático.

## O agente — system prompt (rascunho)
> Persona + regras (lê o playbook completo como contexto).
```
Você é o Gestor de Tráfego Pago da Impacta — um engenheiro de receita, não só media buyer.
Recebe os números do dia de TODAS as campanhas ativas (Meta + Google), nível campanha
e (quando disponível) keyword/anúncio, mais o histórico e as metas (CPL/ROAS) de cada uma.

Sua tarefa: entregar as 3–5 AÇÕES que mais importam HOJE, priorizadas por impacto no
resultado. Cada ação DEVE citar o número que a justifica. Compare cada campanha contra
(a) a meta dela e (b) a mediana da carteira — nunca contra média de indústria cega.

Regras (resumo — ver playbook):
- Sangria de budget (gasto sem retorno) → PAUSE + realocar. É a prioridade #1.
- Bate meta consistente → SCALE +10–20% (nunca dobrar; não resetar learning no Meta).
- Pacing fora de 95–105% / CV>30% por 7d → ajustar antes da volatilidade de CPA.
- Google: termo de busca convertendo → graduar p/ exata; lixo → negativar. CTR baixo = QS baixo = CPC alto.
- Meta: <50 conv/conjunto/semana não estabiliza; subir budget 10–20% a cada 2–3 dias.
- Keyword: separe PERFORMANDO (escalar/graduar) de DESPERDIÇANDO (negativar/pausar).

Saída: JSON estruturado (uma lista de recomendações no schema AgentRecommendation),
em português, objetivo, sem encher linguiça. Se um dado faltar, diga o que falta.
```

### Output (schema de cada recomendação)
`{ scope, platform, campaignRef, entityRef, priority, category, problem, action, expectedImpact, evidence }`

## Tela ADM "Gestor de Tráfego" (wireframe)
```
┌─ Gestor de Tráfego ───────────────────────────── [Atualizar análise] ─┐
│ 🎯 O QUE FAZER HOJE (5)                                                │
│  🔴 CRÍTICO  Meta · M1-CORP   Gastou R$80, 0 lead → PAUSAR + realocar  │
│  🟢 ALTO     Google · Hub G1  CPL R$22 (meta 30) → ESCALAR +20%        │
│  🟡 MÉDIO    Google · Excel   "curso excel" CTR 0,7% → negativar/rever │
│  ...                                                          [✓ feito] │
├─ CARTEIRA (campanhas ativas) ─────────────────────────────────────────│
│ Campanha     Plat   Spend  Impr   Cliq  CTR   CPC   Visitas Lead  CPL  │
│ Hub G1       GGL    R$120  3.4k   210   6,1%  0,57  198     9     13   │
│ Corp PJ      META   R$50   12k    240   2,0%  0,21  180     4     12   │
│ ...                                                                    │
└───────────────────────────────────────────────────────────────────────┘
```

## Fluxo
- **Diário (cron):** coleta (ingest já existe) → monta o dataset cross-campanha → Claude (playbook) → grava `AgentRecommendation` → aparece na tela.
- **Sob demanda:** botão "Atualizar análise" roda o mesmo na hora.
- **(Futuro) MCP interativo:** modo "converse com as campanhas" puxando dados ao vivo — NÃO no engine diário.

## Fases de build
1. **Modelo + tela de "Campanhas rastreadas"** (registro via UI, sai do código). 🥇
2. **Tela ADM cross-campanha** (carteira lado a lado) + agente de portfólio (digest priorizado). 🥈
3. **Ingestão nível keyword/anúncio** → dicas cirúrgicas de palavra-chave. 🥉
4. **(Opcional) MCP interativo.**
