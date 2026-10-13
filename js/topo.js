/* =====================================================================
 * topo.js: mapa topográfico animado no fundo do hero (#topo)
 * ---------------------------------------------------------------------
 * A ideia, em 4 passos:
 *
 *   1. RELEVO: imagine o hero como um terreno. Para cada ponto (x, y)
 *      calculamos uma "altura" entre 0 e 1 usando VALUE NOISE: um ruído
 *      suave, sem saltos, que parece colinas. Somamos 3 camadas
 *      ("oitavas"): uma grande e lenta, outras menores e mais fracas,
 *      que dão os detalhes. Cada camada se move numa direção diferente,
 *      então o terreno "respira" em vez de só deslizar.
 *
 *   2. MORRO DO MOUSE: somamos um morrinho em forma de sino (curva
 *      gaussiana) onde está o mouse. Ele segue o mouse com atraso suave
 *      (lerp), o que gera anéis de curvas de nível em volta do cursor.
 *
 *   3. CURVAS DE NÍVEL: uma curva de nível liga os pontos de mesma altura
 *      (como num mapa de trilha). Para desenhá-las usamos o algoritmo
 *      MARCHING SQUARES: dividimos a tela numa grade, olhamos os 4 cantos
 *      de cada quadradinho e decidimos por onde a curva passa por dentro
 *      dele.
 *
 *   4. DESENHO: a cada 4 níveis, uma curva "mestra" mais forte
 *      (--topo-line-strong), igual aos mapas de verdade. As demais usam
 *      --topo-line. As cores vêm do CSS, então seguem o tema.
 *
 * Desempenho (para não pesar):
 *   - Grade de ~14px: poucos milhares de pontos, não um por pixel.
 *   - Todos os traços de um tipo viram UM path e UM stroke por quadro.
 *   - ~30 quadros por segundo (o olho não nota diferença aqui).
 *   - Pausa quando o hero sai da tela ou a aba fica escondida.
 *   - DPR (densidade de pixels da tela) limitado a 2.
 * ===================================================================== */

(function () {
  "use strict";

  const canvas = document.getElementById("topo");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // O hero é o "pai" do canvas: usamos para medir e para ouvir o mouse
  const hero = canvas.closest(".hero") || canvas.parentElement;

  /* -------------------------------------------------------------------
   * Configuração (mexa aqui para mudar o visual)
   * ------------------------------------------------------------------- */
  const CONFIG = {
    cell: 14,           // tamanho do quadradinho da grade (px). Menor = mais detalhe e mais custo
    cellMobile: 18,     // em telas estreitas, grade mais grossa (celular agradece)
    scale: 1 / 420,     // "tamanho" das colinas: 1/420 = colinas de ~400px
    levels: 14,         // quantas curvas de nível entre a altura 0 e 1
    masterEvery: 4,     // a cada 4 curvas, uma é mestra
    drift: 0.000022,    // deriva do terreno: unidades de ruído por milissegundo (~9px/s, bem lento)
    hillHeight: 0.16,   // altura do morro do mouse
    hillRadius: 120,    // "largura" do morro (sigma da gaussiana, em px)
    follow: 0.07,       // lerp: quanto o morro anda em direção ao mouse por quadro (0..1)
    fps: 30,
    lineWidth: 1,
    masterWidth: 1.3,
    fadeInMs: 1400      // as curvas surgem suavemente ao carregar
  };

  const finePointer = window.matchMedia("(pointer: fine)");
  const colorScheme = window.matchMedia("(prefers-color-scheme: light)");

  /* -------------------------------------------------------------------
   * 1. VALUE NOISE
   * Criamos uma tabela 256x256 de números aleatórios fixos (a "rede").
   * Para um ponto qualquer, pegamos os 4 valores da rede ao redor dele e
   * misturamos de forma suave. O resultado é um ruído contínuo.
   * ------------------------------------------------------------------- */
  const SIZE = 256;
  const MASK = SIZE - 1; // 255: "x & MASK" é um jeito rápido de fazer x % 256
  const lattice = new Float32Array(SIZE * SIZE);

  // Gerador pseudoaleatório com semente (mulberry32). Com Math.random()
  // o mapa mudaria a cada F5; com semente fixa, é sempre o mesmo terreno.
  function makeRandom(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const random = makeRandom(20260);
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();

  // smoothstep: curva em "S" que deixa a mistura sem quinas
  function fade(t) {
    return t * t * (3 - 2 * t);
  }

  // Ruído em um ponto (x, y). Retorna um valor entre 0 e 1.
  function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = fade(x - xi); // quanto andamos dentro do quadrado (0..1)
    const fy = fade(y - yi);

    const x0 = xi & MASK;
    const x1 = (xi + 1) & MASK;
    const y0 = (yi & MASK) * SIZE;
    const y1 = ((yi + 1) & MASK) * SIZE;

    // os 4 cantos
    const a = lattice[y0 + x0];
    const b = lattice[y0 + x1];
    const c = lattice[y1 + x0];
    const d = lattice[y1 + x1];

    // mistura na horizontal, depois na vertical (interpolação bilinear)
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fy;
  }

  // As 3 oitavas: [frequência, peso, deriva em x, deriva em y].
  // Direções de deriva diferentes = o terreno se transforma, não só desliza.
  const OCTAVES = [
    [1, 1, 1.0, 0.6],
    [2.1, 0.45, -0.8, 1.1],
    [4.3, 0.18, 0.5, -1.3]
  ];
  const OCTAVE_SUM = OCTAVES.reduce(function (sum, o) { return sum + o[1]; }, 0);

  /* -------------------------------------------------------------------
   * Estado
   * ------------------------------------------------------------------- */
  let width = 0;      // tamanho em pixels de CSS
  let height = 0;
  let cell = CONFIG.cell;
  let cols = 0;       // quantos quadradinhos na horizontal
  let rows = 0;
  let field = new Float32Array(0); // altura de cada canto da grade

  let colorLine = "rgba(181, 199, 122, 0.16)";
  let colorStrong = "rgba(210, 168, 106, 0.30)";

  // Morro do mouse: "target" é onde o mouse está; "hill" é onde o
  // morro está agora (vai chegando aos poucos com o lerp).
  const hill = { x: 0, y: 0, tx: 0, ty: 0, amp: 0, targetAmp: 0 };

  let running = false;     // o loop de animação está ligado?
  let heroVisible = true;
  let rafId = 0;
  let lastFrame = 0;
  let startTime = 0;
  let elapsed = 0;         // tempo "de animação" acumulado (só conta quando rodando)

  /* -------------------------------------------------------------------
   * Cores: lidas do CSS (tokens.css) para seguir o tema
   * ------------------------------------------------------------------- */
  function readColors() {
    const style = getComputedStyle(canvas);
    colorLine = style.getPropertyValue("--topo-line").trim() || colorLine;
    colorStrong = style.getPropertyValue("--topo-line-strong").trim() || colorStrong;
  }

  /* -------------------------------------------------------------------
   * Tamanho: o canvas tem 2 tamanhos!
   *   - o de CSS (quanto ele ocupa na página);
   *   - o interno, em pixels reais (width/height do elemento).
   * Em telas "retina" (DPR 2), 1px de CSS = 2px reais. Se não
   * ajustarmos, o desenho fica borrado.
   * ------------------------------------------------------------------- */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    // setTransform faz 1 unidade do desenho = 1px de CSS
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cell = width < 700 ? CONFIG.cellMobile : CONFIG.cell;
    cols = Math.ceil(width / cell) + 1;
    rows = Math.ceil(height / cell) + 1;
    field = new Float32Array((cols + 1) * (rows + 1));

    draw(); // redesenha já, para não piscar em branco
  }

  /* -------------------------------------------------------------------
   * 2. Calcula a altura de cada canto da grade neste instante
   * ------------------------------------------------------------------- */
  function computeField(time) {
    const t = time * CONFIG.drift;
    const s = CONFIG.scale;
    const useHill = hill.amp > 0.001;
    const twoSigma2 = 2 * CONFIG.hillRadius * CONFIG.hillRadius;
    const stride = cols + 1;

    for (let j = 0; j <= rows; j++) {
      const py = j * cell;
      for (let i = 0; i <= cols; i++) {
        const px = i * cell;

        // soma das oitavas
        let h = 0;
        for (let k = 0; k < OCTAVES.length; k++) {
          const o = OCTAVES[k];
          h += o[1] * noise(px * s * o[0] + t * o[2], py * s * o[0] + t * o[3]);
        }
        h /= OCTAVE_SUM; // volta para 0..1

        // morro do mouse: gaussiana = amp * e^(-distância² / 2σ²)
        if (useHill) {
          const dx = px - hill.x;
          const dy = py - hill.y;
          h += hill.amp * Math.exp(-(dx * dx + dy * dy) / twoSigma2);
        }

        field[j * stride + i] = h;
      }
    }
  }

  /* -------------------------------------------------------------------
   * 3. MARCHING SQUARES
   * Para um nível "L", cada canto do quadradinho está ACIMA (1) ou
   * ABAIXO (0) de L. Os 4 cantos formam um número de 0 a 15 (4 bits):
   *
   *     a ---- b        bit 8 = a (topo-esq)    bit 4 = b (topo-dir)
   *     |      |        bit 2 = c (baixo-dir)   bit 1 = d (baixo-esq)
   *     d ---- c
   *
   * 0 e 15 = tudo de um lado só: nenhuma curva passa por ali.
   * Nos outros casos, a curva cruza 2 lados (ou 4, nos casos 5 e 10).
   * O ponto exato em cada lado é achado por interpolação linear:
   * se a=0.2, b=0.6 e L=0.3, a curva passa a 1/4 do caminho de a até b.
   * ------------------------------------------------------------------- */

  // Onde, entre v1 e v2 (0..1), está o valor "level"
  function lerpEdge(v1, v2, level) {
    const diff = v2 - v1;
    return diff === 0 ? 0.5 : (level - v1) / diff;
  }

  function addContours(level, path) {
    const stride = cols + 1;

    for (let j = 0; j < rows; j++) {
      const y = j * cell;
      for (let i = 0; i < cols; i++) {
        const idx = j * stride + i;
        const a = field[idx];              // topo-esquerda
        const b = field[idx + 1];          // topo-direita
        const c = field[idx + stride + 1]; // baixo-direita
        const d = field[idx + stride];     // baixo-esquerda

        let code = 0;
        if (a > level) code |= 8;
        if (b > level) code |= 4;
        if (c > level) code |= 2;
        if (d > level) code |= 1;
        if (code === 0 || code === 15) continue; // a curva não passa aqui

        const x = i * cell;

        // Pontos de cruzamento em cada lado (só calculamos quando usados)
        // top: entre a e b | right: entre b e c | bottom: entre d e c | left: entre a e d
        const topX = x + cell * lerpEdge(a, b, level);
        const rightY = y + cell * lerpEdge(b, c, level);
        const bottomX = x + cell * lerpEdge(d, c, level);
        const leftY = y + cell * lerpEdge(a, d, level);
        const right = x + cell;
        const bottom = y + cell;

        switch (code) {
          case 1: case 14: // só d diferente: corta esquerda e baixo
            path.moveTo(x, leftY); path.lineTo(bottomX, bottom); break;
          case 2: case 13: // só c diferente: baixo e direita
            path.moveTo(bottomX, bottom); path.lineTo(right, rightY); break;
          case 3: case 12: // c e d juntos: linha horizontal (esquerda-direita)
            path.moveTo(x, leftY); path.lineTo(right, rightY); break;
          case 4: case 11: // só b diferente: topo e direita
            path.moveTo(topX, y); path.lineTo(right, rightY); break;
          case 6: case 9:  // b e c juntos: linha vertical (topo-baixo)
            path.moveTo(topX, y); path.lineTo(bottomX, bottom); break;
          case 7: case 8:  // só a diferente: topo e esquerda
            path.moveTo(x, leftY); path.lineTo(topX, y); break;
          case 5: case 10: {
            // Casos ambíguos ("sela"): cantos opostos iguais. Olhamos a
            // média do centro para decidir como ligar os 4 pontos.
            const center = (a + b + c + d) / 4;
            const centerAbove = center > level;
            // code 5 = b e d acima; code 10 = a e c acima
            if ((code === 5) === centerAbove) {
              // o centro "une" os cantos acima: separa a e c
              path.moveTo(x, leftY); path.lineTo(topX, y);
              path.moveTo(bottomX, bottom); path.lineTo(right, rightY);
            } else {
              // separa b e d
              path.moveTo(topX, y); path.lineTo(right, rightY);
              path.moveTo(x, leftY); path.lineTo(bottomX, bottom);
            }
            break;
          }
        }
      }
    }
  }

  /* -------------------------------------------------------------------
   * 4. Desenha um quadro completo
   * ------------------------------------------------------------------- */
  function draw() {
    if (!width || !height) return;

    computeField(elapsed);

    ctx.clearRect(0, 0, width, height);

    // Dois "pincéis": um path para as curvas comuns e outro para as mestras.
    // Juntar tudo num path só e dar 1 stroke é MUITO mais rápido do que
    // dar um stroke por segmento.
    const normal = new Path2D();
    const master = new Path2D();

    // Os níveis vão de 1/levels até (levels-1)/levels (pulamos 0 e 1,
    // que quase nunca aparecem).
    for (let n = 1; n < CONFIG.levels; n++) {
      const level = n / CONFIG.levels;
      addContours(level, n % CONFIG.masterEvery === 0 ? master : normal);
    }

    // Surgimento suave nos primeiros instantes
    const fadeIn = Math.min(1, (performance.now() - startTime) / CONFIG.fadeInMs);
    ctx.globalAlpha = fadeIn;

    ctx.lineJoin = "round";
    ctx.lineWidth = CONFIG.lineWidth;
    ctx.strokeStyle = colorLine;
    ctx.stroke(normal);

    ctx.lineWidth = CONFIG.masterWidth;
    ctx.strokeStyle = colorStrong;
    ctx.stroke(master);

    ctx.globalAlpha = 1;
  }

  /* -------------------------------------------------------------------
   * Loop de animação com requestAnimationFrame
   * O rAF chama a função ~60x por segundo, sincronizado com a tela.
   * Para economizar, só desenhamos se já passou 1/30 s desde o último.
   * ------------------------------------------------------------------- */
  const frameInterval = 1000 / CONFIG.fps;

  function loop(now) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);

    const delta = now - lastFrame;
    if (delta < frameInterval - 1) return; // cedo demais: pula este quadro
    // Math.min evita um "pulo" enorme no terreno depois de uma pausa
    elapsed += Math.min(delta, 100);
    lastFrame = now;

    // lerp do morro: anda uma fração do caminho até o alvo
    hill.x += (hill.tx - hill.x) * CONFIG.follow;
    hill.y += (hill.ty - hill.y) * CONFIG.follow;
    hill.amp += (hill.targetAmp - hill.amp) * CONFIG.follow;

    draw();
  }

  function start() {
    if (running) return;
    if (!heroVisible || document.hidden) return;
    running = true;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  /* -------------------------------------------------------------------
   * Mouse: só em aparelhos com ponteiro preciso (mouse/trackpad)
   * ------------------------------------------------------------------- */
  if (hero) {
    hero.addEventListener("pointermove", function (event) {
      if (!finePointer.matches) return;
      // posição do mouse relativa ao canvas
      const rect = canvas.getBoundingClientRect();
      hill.tx = event.clientX - rect.left;
      hill.ty = event.clientY - rect.top;
      if (hill.targetAmp === 0) {
        // primeira vez que entra: o morro nasce já no lugar do mouse
        // (cresce do zero, em vez de "voar" do canto da tela)
        if (hill.amp < 0.001) {
          hill.x = hill.tx;
          hill.y = hill.ty;
        }
        hill.targetAmp = CONFIG.hillHeight;
      }
    }, { passive: true });

    hero.addEventListener("pointerleave", function () {
      hill.targetAmp = 0; // o morro "afunda" suavemente
    }, { passive: true });
  }

  /* -------------------------------------------------------------------
   * Quando pausar e quando redesenhar
   * ------------------------------------------------------------------- */

  // Pausa quando o hero sai da tela (ninguém está vendo)
  if ("IntersectionObserver" in window && hero) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      if (heroVisible) start(); else stop();
    }).observe(hero);
  }

  // Pausa quando a aba fica escondida
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });

  // Redimensiona quando o tamanho do hero muda (ResizeObserver é melhor
  // que window.resize: pega também mudanças de layout sem resize da janela)
  if ("ResizeObserver" in window) {
    new ResizeObserver(function () {
      resize();
    }).observe(canvas);
  } else {
    window.addEventListener("resize", resize, { passive: true });
  }

  // Tema mudou: relê as cores e redesenha
  function onThemeChange() {
    readColors();
    draw();
  }
  document.addEventListener("themechange", onThemeChange);
  if (colorScheme.addEventListener) colorScheme.addEventListener("change", onThemeChange);

  /* -------------------------------------------------------------------
   * Início
   * ------------------------------------------------------------------- */
  startTime = performance.now();
  readColors();
  resize();   // mede o canvas e desenha o 1º quadro
  start();
})();
