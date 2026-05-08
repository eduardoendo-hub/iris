# 06 — Design System

## Reuso do TechNow Hub DS
Tokens vivem em `technow-social-engine/design-system/tech_now_design_system/`:
- `colors_and_type.css` — paleta + tipografia oficial
- `ui_kits/` — componentes base
- `CLAUDE.md` / `SKILL.md` — guia de uso

**Estratégia no IRIS**:
- Importar `colors_and_type.css` como dependência (NPM workspace ou submódulo)
- Componentes base (Button, Card, Input) — reusar do `ui_kits/`
- Componentes de cockpit específicos do IRIS — criar localmente

## Identidade IRIS (extensão do DS TechNow)

### Mood
Cockpit de comando espacial. Dark default. Glow azul TechNow + acentos âmbar pra urgência.

### Cores de status (extensão IRIS)
| Token | Hex | Uso |
|---|---|---|
| `--status-info` | `#0A88F4` (TechNow blue) | Informativo, neutro |
| `--status-warn` | `#F4B400` | Atenção, vale olhar |
| `--status-high` | `#F49B0A` | Ação em 48h |
| `--status-critical` | `#E53935` | Ação agora |
| `--status-success` | `#3FBF7F` | Métrica positiva, meta batida |

### Tipografia
- Mesma família TechNow: **Ubuntu** (300/400/500/700)
- Números/métricas: **Ubuntu Mono** (400/500/700) — alinha melhor em tabelas
- Fallback: `system-ui, -apple-system, sans-serif`

## Componentes próprios IRIS

### `<KPICard>`
```tsx
<KPICard
  label="Visitas (7d)"
  value={3847}
  delta={+12.4}             // % vs período anterior
  format="number"            // | "currency" | "percent"
  sparkline={[...7 points]}
  status="info"              // colorize delta arrow
/>
```

### `<InsightItem>`
```tsx
<InsightItem
  insight={insightObj}
  onAck={() => mutateAck(insightObj.id)}
/>
```
Layout: barra vertical colorida (severity) + title bold + body + recommendation collapsible + button "Acked".

### `<ProductSelector>`
Dropdown topbar com search; mostra produto ativo, troca filtra cockpit inteiro.

### `<ChannelTable>`
Tabela responsiva: Canal | Custo | Visitas | Cliques CTA | CPC | CTR. Sorting clicável.

### `<CTAPositionTable>`
Tabela horizontal: header / hero / info / final / footer com cliques + % do total.

### `<TimeRangePicker>`
Chips: Hoje · 7d · 30d · 90d · Custom (date picker).

### `<RealtimeBadge>`
Pulso verde animado + "ao vivo · atualizado há 12s". Ficou >2min sem update → vira amarelo.

### `<MetricChart>`
Line chart com 1-2 séries (Recharts ou Tremor). Eixos Y duplos quando series têm magnitudes diferentes (ex: sessões + custo).

## Layout cockpit (1280px+)

```
┌────────────────────────────────────────────────────────────┐
│  TechNow logo  [Direito 5.0 ▼]  [7d ▼]    🔔 (3)  👤      │  ← topbar
├────────────────────────────────────────────────────────────┤
│  [KPI: Visitas]  [KPI: Cliques]  [KPI: CTR]  [KPI: Custo]  │
├────────────────────────────────────────────────────────────┤
│  📈 Sessões + Custo (linha 7d, 2 eixos Y)                   │
├──────────────────────────┬─────────────────────────────────┤
│  Por canal               │  Insights timeline              │
│  ┌─────────────────────┐ │  ┌───────────────────────────┐  │
│  │ google/cpc │ R$ 800 │ │  │ 🔴 CTR caiu 22% nas 24h   │  │
│  │ meta/cpc   │ R$ 440 │ │  │ 🟡 CPC subiu 15%          │  │
│  │ organic    │   —    │ │  │ 🔵 Resumo do dia          │  │
│  └─────────────────────┘ │  └───────────────────────────┘  │
├──────────────────────────┴─────────────────────────────────┤
│  Por CTA Position: hero 47 · final 23 · header 12 · ...    │
└────────────────────────────────────────────────────────────┘
🟢 ao vivo · atualizado há 12s
```

## Mobile (<768px)
- Stack tudo vertical
- KPIs viram carrossel horizontal swipável
- Tabelas viram cards (1 linha = 1 card)
- Topbar colapsa logo + hamburger
- Real-time badge ancora no rodapé

## Acessibilidade
- Contraste mínimo WCAG AA
- Severity não codificada apenas por cor (sempre tem ícone + label)
- Focus visível em todos elementos interativos
- `aria-live="polite"` no `<RealtimeBadge>` pra anunciar updates
- Reduzir motion: respeitar `prefers-reduced-motion`

## Dark mode
- Default. Não tem light mode no MVP.
- Background base: `#030200` → `#001a33` (gradient TechNow)
- Surface (cards): `rgba(255,255,255,0.04)` com `backdrop-filter: blur(8px)`
- Borders: `rgba(255,255,255,0.08)`

## Animações
- Entrada de cards: fade-up 200ms ease-out
- Update de número (KPI): tween 400ms (animateNumber)
- Pulso do realtime badge: scale 1 → 1.4, 1.5s loop
- Severity high/critical: leve glow pulsante na borda do `<InsightItem>`
