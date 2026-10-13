/* =====================================================================
 * main.js: comportamento geral da página
 * ---------------------------------------------------------------------
 * Cuida de:
 *   1. Navbar com fundo ao rolar (.navbar--scrolled)
 *   2. Barra de progresso de leitura (--p)
 *   3. Progresso da timeline (--progress + .is-reached)
 *   4. Menu hambúrguer no mobile
 *   5. Link ativo conforme a seção visível
 *   6. Sublinhado deslizante da navbar (#nav-indicator)
 *   7. Tema claro/escuro (#theme-toggle)
 *   8. Botões "magnéticos" (.magnetic)
 *   9. Lanterna nos cards (.card)
 *  10. Inclinação 3D da foto (#about-photo)
 *  11. Copiar email + aviso (toast)
 *  12. Ano atual no rodapé
 *
 * Por que não esperamos "DOMContentLoaded"?
 * Porque o <script> tem `defer`: o navegador só EXECUTA este arquivo
 * depois de montar todo o HTML. Quando este código roda, os elementos
 * já existem.
 *
 * Regra que vale para o arquivo todo: cada parte começa checando se os
 * elementos existem. Se alguém apagar um pedaço do HTML, só aquela
 * parte deixa de funcionar; o resto continua.
 * ===================================================================== */

// IIFE (função que se executa sozinha): as variáveis daqui não "vazam"
// para o escopo global e não colidem com as dos outros arquivos.
(function () {
  "use strict";

  const root = document.documentElement; // o <html>

  // Media queries lidas pelo JS. ".matches" diz se valem agora.
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)"); // mouse/trackpad

  // Efeitos que seguem o mouse só fazem sentido com mouse e sem
  // pedido de "menos movimento".
  function canAnimatePointer() {
    return finePointer.matches && !reducedMotion.matches;
  }

  /* -------------------------------------------------------------------
   * Ferramenta: rafThrottle
   * Eventos como scroll e pointermove disparam DEZENAS de vezes por
   * segundo, mais do que a tela consegue desenhar. Esta função embrulha
   * um handler para ele rodar no máximo 1 vez por quadro, dentro de um
   * requestAnimationFrame (o momento certo para mexer no visual).
   * Só o último evento de cada quadro é usado.
   * ------------------------------------------------------------------- */
  function rafThrottle(fn) {
    let scheduled = false;
    let lastArgs = null;
    return function () {
      lastArgs = arguments;
      if (scheduled) return; // já tem um quadro agendado: só atualiza os args
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        fn.apply(null, lastArgs);
      });
    };
  }

  /* -------------------------------------------------------------------
   * 1, 2 e 3. Tudo que depende da rolagem, num handler só
   * ------------------------------------------------------------------- */
  const navbar = document.getElementById("navbar");
  const progressBar = document.getElementById("progress-bar");
  const timeline = document.getElementById("timeline");
  const timelineItems = timeline ? timeline.querySelectorAll(".timeline__item") : [];

  // Navbar ganha fundo depois de 20px de rolagem
  function updateNavbar() {
    if (!navbar) return;
    // toggle(classe, condição): adiciona se true, remove se false
    navbar.classList.toggle("navbar--scrolled", window.scrollY > 20);
  }

  // Progresso de leitura: 0 no topo, 1 no fim da página
  function updateProgress() {
    if (!progressBar) return;
    // quanto dá para rolar no total = altura da página - altura da janela
    const max = root.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    progressBar.style.setProperty("--p", p.toFixed(4));
  }

  // Timeline: a linha verde cresce até uma "linha imaginária" a 60% da
  // altura da tela. O que passou dessa linha já foi "percorrido".
  //
  // Geometria (combinada com o CSS): o ::after do #timeline tem "top" e
  // "bottom", então o comprimento visível da linha é
  //   altura do #timeline - top - bottom.
  //
  // Essas medidas NÃO mudam com o scroll, só quando o layout muda
  // (resize, troca de idioma, fonte carregada). Por isso medimos uma vez
  // e guardamos em "geo"; a cada quadro de scroll só fazemos contas.
  // (getComputedStyle a cada quadro, para cada item, seria desperdício.)
  let geo = null;

  function measureTimeline() {
    if (!timeline) return;
    // getComputedStyle(el, "::after") lê o CSS de um pseudo-elemento
    const line = getComputedStyle(timeline, "::after");
    const lineTop = parseFloat(line.top) || 0;
    const lineBottom = parseFloat(line.bottom) || 0;

    geo = {
      lineTop: lineTop,
      lineH: Math.max(1, timeline.offsetHeight - lineTop - lineBottom),
      // Centro de cada bolinha, em px a partir do topo do #timeline.
      // offsetTop funciona porque o #timeline é position: relative.
      // + top da bolinha (::before) + 7 (metade dos 14px dela).
      dots: Array.prototype.map.call(timelineItems, function (item) {
        const dotTop = parseFloat(getComputedStyle(item, "::before").top) || 0;
        return item.offsetTop + dotTop + 7;
      })
    };
  }

  function updateTimeline() {
    if (!timeline) return;
    if (!geo) measureTimeline();

    const rect = timeline.getBoundingClientRect(); // isto sim muda com o scroll
    const anchor = window.innerHeight * 0.6;

    let progress = (anchor - rect.top - geo.lineTop) / geo.lineH;
    progress = Math.min(1, Math.max(0, progress)); // trava entre 0 e 1
    timeline.style.setProperty("--progress", progress.toFixed(4));

    // Até onde (em px, a partir do topo da timeline) a linha chegou
    const lineEnd = geo.lineTop + progress * geo.lineH;

    timelineItems.forEach(function (item, i) {
      item.classList.toggle("is-reached", lineEnd >= geo.dots[i]);
    });
  }

  // Quando o layout muda, mede de novo e atualiza
  const remeasureTimeline = rafThrottle(function () {
    measureTimeline();
    updateTimeline();
  });
  if (timeline) {
    window.addEventListener("resize", remeasureTimeline, { passive: true });
    document.addEventListener("langchange", remeasureTimeline);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(remeasureTimeline);
    }
  }

  const onScroll = rafThrottle(function () {
    updateNavbar();
    updateProgress();
    updateTimeline();
  });

  // passive: true avisa que não vamos chamar preventDefault(),
  // o que deixa a rolagem mais fluida.
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  onScroll(); // roda uma vez: a página pode abrir já rolada (F5 no meio)

  /* -------------------------------------------------------------------
   * 4. Menu hambúrguer (mobile)
   * aria-expanded diz aos leitores de tela se o menu está aberto.
   * ------------------------------------------------------------------- */
  const navToggle = document.getElementById("nav-toggle");
  const navLinks = document.getElementById("nav-links");

  function setMenuOpen(isOpen) {
    if (!navToggle || !navLinks) return;
    navLinks.classList.toggle("navbar__links--open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen)); // atributos são texto
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      const isOpen = navToggle.getAttribute("aria-expanded") === "true";
      setMenuOpen(!isOpen);
    });

    // Fecha ao clicar num link (a pessoa vai para a seção)
    navLinks.addEventListener("click", function (event) {
      // closest("a") acha o <a> mesmo se o clique foi num filho dele
      if (event.target.closest("a")) setMenuOpen(false);
    });

    // Fecha com Esc e devolve o foco ao botão (acessibilidade)
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && navLinks.classList.contains("navbar__links--open")) {
        setMenuOpen(false);
        navToggle.focus();
      }
    });
  }

  /* -------------------------------------------------------------------
   * 5. Link ativo conforme a seção visível
   * O IntersectionObserver avisa quando um elemento cruza uma área da
   * tela. rootMargin "-45% 0px -55% 0px" corta 45% de cima e 55% de
   * baixo: sobra uma linha fina no meio. A seção que cruza essa linha
   * é a "atual".
   * ------------------------------------------------------------------- */
  const links = document.querySelectorAll(".navbar__link");
  const sections = document.querySelectorAll("main section[id]");
  let activeLink = null; // o <a> ativo agora (ou null, no hero)

  function setActiveLink(id) {
    activeLink = null;
    links.forEach(function (link) {
      const isActive = link.getAttribute("href") === "#" + id;
      link.classList.toggle("navbar__link--active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "true");
        activeLink = link;
      } else {
        link.removeAttribute("aria-current");
      }
    });
    // se o mouse não está sobre a navbar, o sublinhado vai para o ativo
    if (!hoveredLink) moveIndicator(activeLink);
  }

  /* -------------------------------------------------------------------
   * 6. Sublinhado deslizante
   * O CSS posiciona #nav-indicator com:
   *   --x: distância (px) da esquerda da lista até o link;
   *   --w: largura (px) do link;
   *   --o: opacidade (0 escondido, 1 visível).
   * Ele fica no link ativo e, no hover, segue o link sob o mouse.
   * ------------------------------------------------------------------- */
  const indicator = document.getElementById("nav-indicator");
  let hoveredLink = null;
  let indicatorShown = false;

  function moveIndicator(link) {
    if (!indicator || !navLinks) return;

    if (!link) {
      indicator.style.setProperty("--o", "0");
      indicatorShown = false;
      return;
    }

    // A lista (ul) é position: relative no desktop, então ela é o
    // "offsetParent" do link: offsetLeft já é a distância até ela.
    const x = link.offsetLeft;
    const w = link.offsetWidth;

    // Se estava escondido, "teleporta" sem animação para o lugar certo
    // antes de aparecer (senão ele deslizaria de uma posição antiga).
    if (!indicatorShown) {
      indicator.style.transition = "none";
      indicator.style.setProperty("--x", x + "px");
      indicator.style.setProperty("--w", w + "px");
      void indicator.offsetWidth; // força o navegador a aplicar agora (reflow)
      indicator.style.transition = ""; // devolve a transição do CSS
    }

    indicator.style.setProperty("--x", x + "px");
    indicator.style.setProperty("--w", w + "px");
    indicator.style.setProperty("--o", "1");
    indicatorShown = true;
  }

  if (indicator && navLinks) {
    links.forEach(function (link) {
      link.addEventListener("mouseenter", function () {
        hoveredLink = link;
        moveIndicator(link);
      });
      // Teclado (Tab): o foco se comporta igual ao hover
      link.addEventListener("focusin", function () {
        hoveredLink = link;
        moveIndicator(link);
      });
      link.addEventListener("focusout", function () {
        hoveredLink = null;
        moveIndicator(activeLink);
      });
    });

    // Saiu da lista: volta para o link ativo
    navLinks.addEventListener("mouseleave", function () {
      hoveredLink = null;
      moveIndicator(activeLink);
    });

    // A largura do texto muda no resize, na troca de idioma e quando a
    // fonte termina de carregar. Nesses casos, recalculamos.
    const refreshIndicator = rafThrottle(function () {
      indicatorShown = false; // reposiciona sem deslizar
      moveIndicator(hoveredLink || activeLink);
    });
    window.addEventListener("resize", refreshIndicator, { passive: true });
    document.addEventListener("langchange", refreshIndicator);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(refreshIndicator);
    }
  }

  if ("IntersectionObserver" in window && links.length && sections.length) {
    const sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActiveLink(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -55% 0px" }
    );
    sections.forEach(function (section) {
      sectionObserver.observe(section);
    });
  }

  /* -------------------------------------------------------------------
   * 7. Tema claro/escuro
   * O tema "vale" assim:
   *   - se existe data-theme no <html>, ele manda;
   *   - senão, segue o sistema (prefers-color-scheme).
   * O script inline do <head> já aplicou o tema salvo antes do CSS,
   * para não piscar. Aqui só cuidamos do clique.
   * ------------------------------------------------------------------- */
  const themeToggle = document.getElementById("theme-toggle");
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)");

  function currentTheme() {
    const attr = root.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return prefersLight.matches ? "light" : "dark";
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      const next = currentTheme() === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch (e) {
        /* sem armazenamento: o tema vale só até fechar a página */
      }
      // Avisa quem precisa (o topo.js relê as cores do canvas)
      document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: next } }));
    });
  }

  /* -------------------------------------------------------------------
   * 8. Botões magnéticos
   * O botão "puxa" até 8px na direção do mouse. O CSS usa --tx/--ty
   * num translate. Zeramos ao sair.
   * ------------------------------------------------------------------- */
  const MAGNET_MAX = 8;

  document.querySelectorAll(".magnetic").forEach(function (el) {
    const onMove = rafThrottle(function (event) {
      if (!canAnimatePointer()) return;
      const rect = el.getBoundingClientRect();
      // O rect já inclui o deslocamento atual; descontamos para medir
      // a partir do centro "original" do botão.
      const currentX = parseFloat(el.style.getPropertyValue("--tx")) || 0;
      const currentY = parseFloat(el.style.getPropertyValue("--ty")) || 0;
      const centerX = rect.left - currentX + rect.width / 2;
      const centerY = rect.top - currentY + rect.height / 2;

      // De -1 a 1: quanto o mouse está para cada lado do centro
      const relX = (event.clientX - centerX) / (rect.width / 2);
      const relY = (event.clientY - centerY) / (rect.height / 2);

      el.style.setProperty("--tx", (clamp(relX) * MAGNET_MAX).toFixed(2) + "px");
      el.style.setProperty("--ty", (clamp(relY) * MAGNET_MAX).toFixed(2) + "px");
    });

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", function () {
      // requestAnimationFrame garante que o zero vem DEPOIS de um
      // possível onMove que ainda estava agendado
      requestAnimationFrame(function () {
        el.style.setProperty("--tx", "0px");
        el.style.setProperty("--ty", "0px");
      });
    }, { passive: true });
  });

  function clamp(value) {
    return Math.max(-1, Math.min(1, value));
  }

  /* -------------------------------------------------------------------
   * 9. Lanterna dos cards
   * O ::before do card tem um brilho radial centrado em --mx/--my.
   * Aqui só informamos onde o mouse está DENTRO do card.
   * ------------------------------------------------------------------- */
  document.querySelectorAll(".card").forEach(function (card) {
    const onMove = rafThrottle(function (event) {
      if (!finePointer.matches) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", (event.clientX - rect.left).toFixed(1) + "px");
      card.style.setProperty("--my", (event.clientY - rect.top).toFixed(1) + "px");
    });
    card.addEventListener("pointermove", onMove, { passive: true });
  });

  /* -------------------------------------------------------------------
   * 10. Inclinação 3D da foto
   * --rx/--ry giram o quadro (máx. 8 graus) e --gx/--gy movem o
   * reflexo de luz para onde o mouse está.
   * ------------------------------------------------------------------- */
  const photo = document.getElementById("about-photo");
  const photoFrame = photo ? photo.querySelector(".about__photo-frame") : null;
  const TILT_MAX = 8;

  if (photo && photoFrame) {
    const onMove = rafThrottle(function (event) {
      if (!canAnimatePointer()) return;
      const rect = photoFrame.getBoundingClientRect();
      // posição do mouse de 0 a 1 dentro do quadro
      const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));

      // Mouse à direita -> gira no eixo Y para a direita (ry positivo).
      // Mouse em cima -> a borda de cima "vem" para a frente (rx positivo).
      const ry = (px - 0.5) * 2 * TILT_MAX;
      const rx = (0.5 - py) * 2 * TILT_MAX;

      photoFrame.style.setProperty("--rx", rx.toFixed(2) + "deg");
      photoFrame.style.setProperty("--ry", ry.toFixed(2) + "deg");
      photoFrame.style.setProperty("--gx", (px * 100).toFixed(1) + "%");
      photoFrame.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
    });

    photo.addEventListener("pointermove", onMove, { passive: true });
    photo.addEventListener("pointerleave", function () {
      requestAnimationFrame(function () {
        photoFrame.style.setProperty("--rx", "0deg");
        photoFrame.style.setProperty("--ry", "0deg");
        photoFrame.style.setProperty("--gx", "50%");
        photoFrame.style.setProperty("--gy", "50%");
      });
    }, { passive: true });
  }

  /* -------------------------------------------------------------------
   * 11. Copiar email + toast
   * navigator.clipboard.writeText copia para a área de transferência.
   * Ele só funciona em resposta a um clique e em páginas seguras
   * (https ou localhost). Se falhar, selecionamos o texto do email
   * para a pessoa copiar com Ctrl+C.
   * ------------------------------------------------------------------- */
  const copyBtn = document.getElementById("copy-email");
  const emailLink = document.getElementById("email-address");
  const toast = document.getElementById("toast");
  let toastTimer = null;

  // Textos de reserva, caso o JSON do idioma não tenha carregado
  const FALLBACK = {
    pt: { copied: "Email copiado", copyFail: "Não deu para copiar. Selecione o email e copie manualmente." },
    en: { copied: "Email copied", copyFail: "Couldn't copy. Select the email and copy it manually." }
  };

  function text(key) {
    const fromI18n = window.I18n && window.I18n.t("contact." + key);
    if (fromI18n) return fromI18n;
    const lang = window.I18n && window.I18n.lang === "en" ? "en" : "pt";
    return FALLBACK[lang][key];
  }

  function showToast(message) {
    if (!toast) return;
    clearTimeout(toastTimer); // se já havia um toast, reinicia a contagem
    toast.textContent = message; // aria-live faz o leitor de tela anunciar
    toast.classList.add("toast--show");
    toastTimer = setTimeout(function () {
      toast.classList.remove("toast--show");
    }, 2200);
  }

  // Seleciona o texto do email (como se a pessoa tivesse arrastado o mouse)
  function selectEmail() {
    if (!emailLink || !window.getSelection) return;
    const range = document.createRange();
    range.selectNodeContents(emailLink);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function copyFailed() {
    selectEmail();
    showToast(text("copyFail"));
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      const email = copyBtn.getAttribute("data-email") ||
        (emailLink ? emailLink.textContent.trim() : "");

      if (!email || !navigator.clipboard || !navigator.clipboard.writeText) {
        copyFailed();
        return;
      }

      // writeText devolve uma Promise: then = deu certo, catch = falhou
      navigator.clipboard.writeText(email)
        .then(function () {
          showToast(text("copied"));
        })
        .catch(copyFailed);
    });
  }

  /* -------------------------------------------------------------------
   * 12. Ano atual no rodapé
   * ------------------------------------------------------------------- */
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
