/* =====================================================================
 * typing.js: efeito de "máquina de escrever" no hero
 * ---------------------------------------------------------------------
 * O elemento #typing tem um atributo com a lista de palavras em JSON:
 *   <span id="typing" data-words='["APIs","sistemas"]'>APIs</span>
 *
 * O ciclo é: digita a palavra letra por letra -> pausa -> apaga ->
 * passa para a próxima -> repete para sempre.
 * O cursor piscando é feito só com CSS (.typing::after).
 *
 * Com prefers-reduced-motion (pessoa pediu menos movimento ao sistema),
 * mostramos só a 1ª palavra, parada.
 *
 * Quando o idioma muda (evento "langchange"), reiniciamos com as
 * palavras do novo idioma. Para não rodar DOIS loops ao mesmo tempo,
 * sempre cancelamos o timer anterior com clearTimeout.
 * ===================================================================== */

(function () {
  "use strict";

  const el = document.getElementById("typing");
  if (!el) return; // sem o elemento, não há o que fazer

  // Velocidades em milissegundos
  const TYPE_SPEED = 85;    // tempo entre uma letra e outra ao digitar
  const DELETE_SPEED = 45;  // apagar é mais rápido, fica mais natural
  const HOLD_TIME = 1600;   // pausa com a palavra completa
  const GAP_TIME = 350;     // pausa com o texto vazio antes da próxima

  // matchMedia lê uma media query pelo JS (a mesma sintaxe do CSS)
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let words = [];
  let wordIndex = 0;   // qual palavra da lista
  let charCount = 0;   // quantas letras dela já estão na tela
  let deleting = false;
  let timer = null;    // guarda o id do setTimeout para poder cancelar

  // Lê o JSON do atributo com segurança (JSON malformado não quebra nada)
  function readWords() {
    try {
      const list = JSON.parse(el.getAttribute("data-words") || "[]");
      if (Array.isArray(list) && list.length) return list.map(String);
    } catch (e) {
      /* cai no plano B abaixo */
    }
    return [el.textContent.trim()]; // plano B: o texto que já está lá
  }

  // Um "passo" do ciclo. Cada passo agenda o próximo com setTimeout.
  function tick() {
    const word = words[wordIndex];

    if (!deleting) {
      // Digitando: mostra uma letra a mais
      charCount++;
      el.textContent = word.slice(0, charCount);

      if (charCount === word.length) {
        // Palavra completa: espera e começa a apagar
        deleting = true;
        timer = setTimeout(tick, HOLD_TIME);
        return;
      }
      timer = setTimeout(tick, TYPE_SPEED);
    } else {
      // Apagando: mostra uma letra a menos
      charCount--;
      el.textContent = word.slice(0, charCount);

      if (charCount === 0) {
        // Apagou tudo: vai para a próxima palavra (% volta ao início)
        deleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        timer = setTimeout(tick, GAP_TIME);
        return;
      }
      timer = setTimeout(tick, DELETE_SPEED);
    }
  }

  // (Re)começa do zero com uma lista de palavras
  function start(list) {
    clearTimeout(timer); // mata qualquer loop que esteja rodando
    words = list && list.length ? list : readWords();
    wordIndex = 0;

    if (reducedMotion.matches || words.length < 2) {
      // Sem animação: primeira palavra fixa
      el.textContent = words[0];
      return;
    }

    // Começa com a 1ª palavra já escrita (é o que o HTML mostra),
    // espera um pouco e então apaga. Assim não há "pulo" no carregamento.
    el.textContent = words[0];
    charCount = words[0].length;
    deleting = true;
    timer = setTimeout(tick, HOLD_TIME);
  }

  // Troca de idioma: o i18n.js manda o dicionário inteiro no detail
  document.addEventListener("langchange", function (event) {
    const dict = event.detail && event.detail.dict;
    const list = dict && dict.hero && dict.hero.words;
    if (Array.isArray(list) && list.length) {
      // Atualiza também o atributo, para manter o HTML coerente
      el.setAttribute("data-words", JSON.stringify(list));
      start(list.map(String));
    }
  });

  // Se a pessoa mudar a preferência de movimento com a página aberta
  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener("change", function () {
      start(words);
    });
  }

  start(readWords());
})();
