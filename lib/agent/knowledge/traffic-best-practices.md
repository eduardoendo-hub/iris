# Best Practices de Gestão de Tráfego — Meta Ads + Google Ads

Síntese das práticas mais consistentes em campanhas de **educação executiva ao vivo** com ticket médio R$ 1.500–3.000 e janela curta (2–4 semanas).

## Princípios gerais

1. **Decisão por evidência, não por intuição** — espere volume estatístico antes de pausar/escalar. <1.000 impressões pra Meta, <50 cliques pra Search é leitura ruim.
2. **Um eixo de mudança por vez** — não troque criativo, público e copy ao mesmo tempo; perde causalidade.
3. **O algoritmo precisa de 7 dias pra estabilizar** — em campanha curta (4 semanas), evite mexer demais.
4. **Otimize o gargalo, não o início do funil** — se conv LP→compra é o problema, mais tráfego não resolve.
5. **CAC < LTV, sempre** — pra produto sem recompra (curso único), CAC máximo deve ser limitado por margem bruta.

## Meta Ads

### Estrutura de campanha

- **Advantage+ Shopping (ASC) é tentação** mas pra produto de nicho frequentemente sub-performa. **Comece com conjunto manual.**
- **1 campanha por objetivo** (Tráfego vs Conversões — Lead). Não misture.
- **2–4 conjuntos por campanha** — mais que isso dilui o aprendizado do algoritmo.
- **3–5 anúncios por conjunto** — Meta otimiza a impressão entre eles automaticamente.

### Públicos

- **Frio + interesses amplos** funciona melhor que segmentação fina hoje em dia. Públicos detalhados >1M.
- **Lookalike 1–3%** se você tem 500+ conversões no Pixel histórico.
- **Custom audience visitantes da LP (180 dias)** pra remarketing.
- **Excluir compradores e leads já no funil** sempre.

### Criativo

- **Hook nos primeiros 3 segundos** define tudo. Métrica chave: hook rate (>25% no Reels é excelente).
- **Reel > Carrossel > Estático** em prospecção pra educação (autoplay + áudio + storytelling).
- **Carrossel vence em remarketing** (mostrar detalhe da oferta).
- **Vídeo vertical (9:16) com legendas embutidas** — 80% do feed é mudo.
- **Mostre o "antes e depois"** — qual era a dor, qual é o estado novo (mais forte que listar features).
- **5+ variações de copy primário** pra Meta otimizar.
- **CTA visual + verbal** (botão + falado/escrito na peça).
- **Frequência > 4,0** = fadiga, troca criativo.

### Otimização

- **Otimize pra evento de fundo de funil** sempre que possível (Compra > InitiateCheckout > Lead > ViewContent).
- **CBO (Advantage Campaign Budget)** vence ABO na maioria dos casos com orçamento <R$ 500/dia.
- **Janela de atribuição padrão**: 7d clique, 1d view. Não diminua sem motivo.
- **Pixel + CAPI com deduplicação (event_id)** — sem isso você perde 20–30% das conversões iOS 14+.

### Bandeiras vermelhas Meta

- **CPM disparou em 1 dia** sem motivo → competição subiu ou anúncio entrou em revisão policy.
- **Frequência > 5** em <7 dias → audiência muito pequena, expande ou pausa.
- **Cliques sobem mas conversões caem** → criativo atraindo público errado (curiosos, não compradores).
- **Conjuntos com <50 conversões em 7 dias** → algoritmo não aprendeu, junta conjuntos.

## Google Ads

### Estrutura

- **Search > PMax > Display** em ordem de prioridade pra ticket R$ 1.500+.
- **Search**: 1 campanha, 2–3 grupos de anúncios (alta intenção, complementar, branded se aplicável).
- **PMax**: só pra remarketing/expansão depois que tem dados de conversão sólidos.
- **NUNCA Display puro** pra educação — desperdício.

### Palavras-chave Search

- **Match types**: Phrase + Exact >>> Broad. Broad só com Smart Bidding maduro.
- **Negativas obrigatórias**: "grátis", "gratuito", "free", "torrent", "pirata", "pdf", "download", "concurso público", "vagas", "emprego".
- **Quality Score > 7** é alvo. <5 = anúncio ruim ou LP descalibrada da intenção.
- **Lances**:
  - Maximizar Conversões: começa aqui se tem <30 conversões/30 dias.
  - tCPA: quando tem 30+ conversões. CPA alvo = CAC alvo × 0,8 (margem).
  - tROAS: só com 100+ conversões.

### Anúncios RSA (Responsive Search Ads)

- **15 headlines, 4 descriptions** por anúncio.
- **Pins**: posição 1 com o foco do produto, 2 com benefício, 3 com CTA.
- **Inclua preço e datas** em pelo menos 3 headlines.
- **Variar entre racional ("5 dias 20 projetos") e emocional ("pare de perder tempo")**.

### Tracking

- **UTMs no tracking template** da conta:
  `{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}`
- **Auto-tagging do Google Ads** (`gclid`) — mantenha ligado; GA4 usa.
- **Conversões importadas do GA4** > tag direta do Google Ads (evita dupla contagem).

### Bandeiras vermelhas Google

- **CTR Search < 2%** com lance médio → keywords irrelevantes ou copy fraco.
- **Quality Score < 5** → LP não bate com intenção da palavra, ou copy genérico.
- **PMax dominando o spend** → comum, mas sempre olhe canal por canal pra confirmar que Search tem espaço.
- **Conversões só caindo Display** → bot/fraude; aplica filtro de tráfego inválido.

## Diagnóstico por padrão de números

### "Muito tráfego, pouca venda" (LP visits > 200, click_compra < 5)
- Hipótese 1: criativo atrai público errado (CTR alto mas qualificação baixa).
- Hipótese 2: LP não converte (problema de copy, oferta, ou tracking quebrado).
- **Ação**: revisar criativo + verificar tracking do click_compra antes de mexer no tráfego.

### "Poucos cliques no compra, muito no WhatsApp" (click_compra < click_whats × 0.5)
- Público em modo "perguntar antes de comprar" — comum em ticket R$ 1.500+.
- **Ação**: melhorar atendimento SDR (resposta <5min), revisar tooltip WhatsApp, considerar copy mais clara na LP.

### "CPM ok, CTR ok, mas CAC alto"
- Funil pós-clique sangrando. Cada etapa perde X%.
- **Ação**: medir conv % em cada etapa (visit → click_compra → checkout iniciado → pago). Otimize a pior.

### "Dia 1 ótimo, dia 3 ruim, dia 5 péssimo"
- Fadiga criativa OU primeiros conversores eram baixo-funil esperando preço.
- **Ação**: rotaciona criativo no dia 4, expande audiência, ajusta segmentação.

### "Google Ads explodiu o gasto sem motivo"
- Bidding strategy reajustou após uma conversão estatisticamente fraca.
- **Ação**: olhar lance médio, pausar PMax se for o caso, voltar pra Maximizar Conversões temporariamente.

## Heurísticas pra recomendação

- Sempre **priorize ações** (1=mais urgente, 5=nice to have).
- Recomende **mudanças de 1 variável por vez** (não "mude criativo E mexa público E ajuste copy").
- Justifique com **número específico** (não "porque tá caro" — "porque CPL R$ 87 vs alvo R$ 36 = 2,4× alvo").
- **Quantifique impacto esperado** ("reduzir CPL pra R$ 50 = matrículas 12 → 18 no mês").
- **Reconheça incerteza** quando volume é baixo: "amostra pequena, ainda especulativo".
- **Não recomende escalar nada nos primeiros 3 dias** (algoritmo aprendendo).
