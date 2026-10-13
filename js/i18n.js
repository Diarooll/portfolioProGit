/* =====================================================================
 * i18n.js: troca de idioma (PT / EN)
 * ---------------------------------------------------------------------
 * "i18n" é a abreviação de "internationalization" (i + 18 letras + n).
 *
 * Como funciona:
 *   1. O HTML já vem escrito em português. Cada texto traduzível tem um
 *      atributo data-i18n="chave.com.pontos", por exemplo:
 *        <span data-i18n="nav.about">Sobre</span>
 *   2. Os textos de cada idioma ficam em lang/pt.json e lang/en.json.
 *   3. Este arquivo baixa o JSON do idioma (fetch), procura a chave e
 *      troca o texto do elemento.
 *   4. Atributos (aria-label, alt...) usam data-i18n-attr="attr:chave",
 *      por exemplo data-i18n-attr="aria-label:nav.menu".
 *   5. No fim, avisa o resto da página com o evento "langchange", para o
 *      typing.js trocar as palavras e o main.js reposicionar o sublinhado.
 *
 * Se o fetch falhar (ex.: abrindo o arquivo direto, em file://), mostra
 * um aviso no console e a página continua em português.
 * ===================================================================== */

(function () {
  "use strict";

  const SUPPORTED = ["pt", "en"]; // idiomas que temos arquivos
  const STORAGE_KEY = "lang";     // chave usada no localStorage

  // Guarda os dicionários já baixados, para não baixar duas vezes.
  // Ex.: cache.en = { nav: { about: "About" }, ... }
  const cache = {};

  // Idioma e dicionário que estão na tela agora.
  // O HTML nasce em PT, então começamos assim.
  let currentLang = "pt";
  let currentDict = null;

  /* -------------------------------------------------------------------
   * Funções pequenas de apoio
   * ------------------------------------------------------------------- */

  // localStorage pode lançar erro (modo privado, cookies bloqueados).
  // try/catch impede que isso quebre a página inteira.
  function readSaved() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function save(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* sem armazenamento: tudo bem, só não lembra da escolha */
    }
  }

  // Decide o idioma inicial:
  //   1º o que o visitante escolheu antes (localStorage);
  //   2º o idioma do navegador (se começar com "en", usa inglês);
  //   3º português.
  function detectInitialLang() {
    const saved = readSaved();
    if (SUPPORTED.indexOf(saved) !== -1) return saved;

    const browser = (navigator.language || "").toLowerCase();
    if (browser.indexOf("en") === 0) return "en";

    return "pt";
  }

  // Busca um valor dentro do objeto seguindo os pontos da chave.
  // getValue(dict, "projects.p1.title") faz:
  //   dict -> dict.projects -> dict.projects.p1 -> dict.projects.p1.title
  // Se algum pedaço não existir, devolve undefined (sem dar erro).
  function getValue(dict, key) {
    return key.split(".").reduce(function (obj, part) {
      return obj && obj[part] !== undefined ? obj[part] : undefined;
    }, dict);
  }

  // Baixa o JSON de um idioma (ou devolve do cache).
  // fetch devolve uma Promise: um "valor que vai chegar depois".
  function loadDict(lang) {
    if (cache[lang]) return Promise.resolve(cache[lang]);

    return fetch("lang/" + lang + ".json")
      .then(function (response) {
        // fetch só falha sozinho em erro de rede; 404 precisa ser checado
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json(); // converte o texto em objeto JS
      })
      .then(function (dict) {
        cache[lang] = dict;
        return dict;
      });
  }

  /* -------------------------------------------------------------------
   * Aplica um dicionário na página
   * ------------------------------------------------------------------- */
  function applyDict(lang, dict) {
    // 1) Textos: troca o textContent (nunca innerHTML: é mais seguro,
    //    porque o texto não é interpretado como HTML).
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const value = getValue(dict, el.getAttribute("data-i18n"));
      if (typeof value === "string") el.textContent = value;
    });

    // 2) Atributos: "aria-label:nav.menu" vira attr="aria-label", key="nav.menu"
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      const pair = el.getAttribute("data-i18n-attr");
      const sep = pair.indexOf(":");
      if (sep === -1) return; // formato errado: ignora
      const attr = pair.slice(0, sep).trim();
      const value = getValue(dict, pair.slice(sep + 1).trim());
      if (typeof value === "string") el.setAttribute(attr, value);
    });

    // 3) Título da aba e descrição (aparece no Google)
    const title = getValue(dict, "meta.title");
    if (typeof title === "string") document.title = title;

    const metaDesc = document.querySelector('meta[name="description"]');
    const desc = getValue(dict, "meta.description");
    if (metaDesc && typeof desc === "string") metaDesc.setAttribute("content", desc);

    // 4) <html lang>: leitores de tela usam isso para escolher a pronúncia
    document.documentElement.setAttribute("lang", lang === "en" ? "en" : "pt-BR");

    // (o botão #lang-toggle mostra o idioma de DESTINO pela chave
    //  nav.langNext, que já foi trocada no passo 1)

    currentLang = lang;
    currentDict = dict;

    // 5) Avisa os outros scripts. CustomEvent permite mandar dados junto
    //    no campo "detail".
    document.dispatchEvent(
      new CustomEvent("langchange", { detail: { lang: lang, dict: dict } })
    );
  }

  // Baixa e aplica. Se der erro, mantém o que está na tela.
  function setLang(lang) {
    return loadDict(lang)
      .then(function (dict) {
        applyDict(lang, dict);
        save(lang);
      })
      .catch(function (error) {
        console.warn(
          "[i18n] Não consegui carregar lang/" + lang + ".json. " +
          "Mantendo o texto do HTML. (Abra com um servidor: python3 -m http.server)",
          error
        );
      });
  }

  /* -------------------------------------------------------------------
   * API pública: o main.js usa window.I18n.t("contact.copied") no toast.
   * "get lang()" é um getter: parece uma variável, mas é uma função
   * que sempre devolve o valor atualizado.
   * ------------------------------------------------------------------- */
  window.I18n = {
    get lang() {
      return currentLang;
    },
    t: function (key) {
      if (!currentDict) return undefined; // ainda não carregou nenhum JSON
      const value = getValue(currentDict, key);
      return typeof value === "string" ? value : undefined;
    }
  };

  /* -------------------------------------------------------------------
   * Inicialização
   * ------------------------------------------------------------------- */

  // Carrega o idioma inicial. Mesmo sendo PT, baixamos o pt.json para
  // que I18n.t() funcione (o toast precisa dos textos).
  setLang(detectInitialLang());

  // Clique no botão: alterna entre os dois idiomas.
  const toggle = document.getElementById("lang-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      setLang(currentLang === "pt" ? "en" : "pt");
    });
  }
})();
