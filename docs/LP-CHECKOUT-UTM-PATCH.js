/**
 * LP → Engaged: passthrough de TODOS os parametros de URL no clique do
 * checkout. Sem isso, o Engaged recebe URL limpa e nenhuma venda eh
 * atribuida ao canal/campanha de origem.
 *
 * Como aplicar: cola este bloco no <script> principal da LP, logo apos
 * a linha `var CHECKOUT_URL = "https://impacta.site.engaged.com.br/p/checkout/x68jpj7w3k";`
 *
 * Comportamento:
 *   1. Le todos os params da URL atual (utm_*, gclid, fbclid, cupom,
 *      qualquer custom)
 *   2. Fallback nos UTMs persistidos em localStorage de visitas anteriores
 *      (a LP ja salva como lp_utm_source, lp_utm_medium, etc)
 *   3. Re-escreve href de todos os botoes de matricula no DOM ready
 *   4. Re-aplica em cada click (cobre sticky CTA e elementos injetados
 *      depois do load)
 *
 * Resultado: cada clique vira algo como
 *   https://impacta.site.engaged.com.br/p/checkout/x68jpj7w3k
 *     ?utm_source=email&utm_medium=base_impacta&utm_campaign=claude_pro_lancamento_2026
 *     &utm_content=email_03_20_projetos_cupom&utm_term=base_geral&cupom=CLAUDE10
 *
 * Engaged preserva os queryParams no payload do webhook → IRIS grava em
 * Sale.attribution → tooltip da Origem na tabela de Vendas mostra canal/
 * campanha.
 */
(function(){
  if (typeof CHECKOUT_URL === "undefined") {
    console.warn("[checkout-utm] CHECKOUT_URL nao definida — abortando passthrough");
    return;
  }

  var UTM_KEYS = [
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "gclid", "fbclid"
  ];

  function checkoutUrlWithAllParams() {
    var current = new URLSearchParams(location.search);
    // Fallback nos UTMs do localStorage pra primeira visita ter atribuicao
    // mas as proximas (sem UTM na URL) tambem manterem
    UTM_KEYS.forEach(function(k) {
      if (!current.has(k)) {
        try {
          var stored = localStorage.getItem("lp_" + k);
          if (stored) current.set(k, stored);
        } catch (e) { /* sandbox sem localStorage */ }
      }
    });
    // CUPOM: ?cupom= (aliases coupon/voucher_code) na URL do anuncio vira
    // ?voucher_code= no checkout — o Engaged aplica o desconto SOZINHO com esse
    // param (testado no checkout 4jtt6rr7ti: ADVIA30 -> -R$149,10 automatico).
    // Persistido na sessao pra sobreviver a navegacao interna sem grudar pra
    // sempre. Sem este mapeamento, ?cupom= passa cru e o Engaged ignora.
    var cupom = current.get("cupom") || current.get("coupon") || current.get("voucher_code");
    if (cupom) { try { sessionStorage.setItem("lp_cupom", cupom.trim()); } catch (e) {} }
    else { try { cupom = sessionStorage.getItem("lp_cupom"); } catch (e) {} }
    current.delete("cupom"); current.delete("coupon"); // remove alias cru da URL
    if (cupom) current.set("voucher_code", cupom.trim());
    var qs = current.toString();
    return CHECKOUT_URL + (qs ? "?" + qs : "");
  }

  // 1) Reescreve hrefs no DOMContentLoaded
  function applyToExistingLinks() {
    var url = checkoutUrlWithAllParams();
    document.querySelectorAll(
      '[data-track^="cta-buy-"], a[href="' + CHECKOUT_URL + '"]'
    ).forEach(function(el) {
      if (el.tagName === "A") el.setAttribute("href", url);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyToExistingLinks);
  } else {
    applyToExistingLinks();
  }

  // 2) Captura clicks em CTAs adicionados dinamicamente (sticky CTA, etc)
  document.addEventListener("click", function(e) {
    var el = e.target && e.target.closest
      ? e.target.closest('[data-track^="cta-buy-"], a[href*="engaged.com.br/p/checkout"]')
      : null;
    if (!el || el.tagName !== "A") return;
    el.setAttribute("href", checkoutUrlWithAllParams());
  }, true); // capture=true: roda ANTES de outros handlers
})();
