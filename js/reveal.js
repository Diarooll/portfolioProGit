/* =====================================================================
 * reveal.js: elementos aparecem suavemente ao rolar a página
 * ---------------------------------------------------------------------
 * No CSS, todo .reveal começa invisível e um pouco deslocado (mas SÓ
 * quando existe html.js, ou seja, quando o JS está ligado).
 * Aqui, um IntersectionObserver avisa quando cada elemento entra na
 * tela, e colocamos .reveal--visible. O CSS faz a transição.
 *
 * Detalhes:
 *   - threshold 0.12: dispara quando ~12% do elemento está visível.
 *   - rootMargin "0px 0px -8% 0px": encolhe a área de baixo em 8%, para
 *     o elemento aparecer um pouco depois de surgir na borda.
 *   - unobserve: depois de aparecer, paramos de observar (economiza
 *     trabalho e o elemento não some de novo ao subir a página).
 *   - Stagger ("escadinha"): se vários elementos entram juntos e não têm
 *     --delay no HTML, damos 0ms, 80ms, 160ms... para não aparecerem
 *     todos de uma vez.
 *   - Sem IntersectionObserver (navegador muito antigo) ou com
 *     prefers-reduced-motion: mostra tudo de uma vez.
 * ===================================================================== */

(function () {
  "use strict";

  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  const STAGGER_MS = 80;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function showAll() {
    items.forEach(function (el) {
      el.classList.add("reveal--visible");
    });
  }

  if (reducedMotion || !("IntersectionObserver" in window)) {
    showAll();
    return;
  }

  const observer = new IntersectionObserver(
    function (entries) {
      // Só os que estão entrando agora, nesta mesma "leva"
      const entering = entries.filter(function (entry) {
        return entry.isIntersecting;
      });

      let order = 0; // posição na escadinha
      entering.forEach(function (entry) {
        const el = entry.target;

        // el.style.getPropertyValue lê o que está no atributo style="".
        // Se o HTML já definiu --delay, respeitamos.
        const hasInlineDelay = el.style.getPropertyValue("--delay") !== "";
        if (!hasInlineDelay && entering.length > 1) {
          el.style.setProperty("--delay", (order * STAGGER_MS) / 1000 + "s");
          order++;
        }

        el.classList.add("reveal--visible");
        observer.unobserve(el); // já apareceu: não precisa mais observar
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );

  items.forEach(function (el) {
    observer.observe(el);
  });
})();
