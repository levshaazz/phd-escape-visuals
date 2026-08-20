/* ── phd-escape-visuals shared kit ──────────────────────────────────────────
   Every helper here exists because doing it by hand went wrong at least once.
   References are to tmp/KNOWLEDGE-BASE.md.
   ────────────────────────────────────────────────────────────────────────── */
const Kit = (() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const clearActive = sel => document.querySelectorAll(sel).forEach(e => e.classList.remove('active'));

  /* ── palette ──
     Strokes may use the saturated values; anything that is TEXT must come from
     the contrast-checked set (§3.11). AMBER_TEXT is the readable amber. */
  const BLUE = [59, 164, 255], AMBER = [255, 159, 28], STEEL = [136, 153, 170],
        TEAL = [46, 232, 168], RED = [232, 128, 128], VIOLET = [183, 148, 244];
  const BG = '#080d14';
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function drawGlow(ctx, x, y, r, color, alpha = 0.4) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgb(color, alpha));
    g.addColorStop(0.4, rgb(color, alpha * 0.3));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  /* Backing store follows the CSS box. Heights come from the stylesheet — never
     from the width/height attributes, whose ratio would otherwise drive the
     layout by accident (§3.10). */
  function sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }

  /* ── i18n ──
     Translations are applied by walking [data-i18n], not by a hand-written list
     of assignments: a forgotten line in such a list is invisible, and that is
     exactly how two demos ended up with untranslated headers (§3.12). */
  let lang = 'en';
  let table = {};
  let onLangChange = null;

  function T(key) {
    const e = table[key];
    if (!e) return key;
    return (e[lang] !== undefined ? e[lang] : e.en);
  }
  function TF(key, ...args) {
    const v = T(key);
    return typeof v === 'function' ? v(...args) : v;
  }

  function applyI18n(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = T(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = T(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = T(el.dataset.i18nTitle); });
  }

  /* Theory blocks are selected by data attributes rather than id strings, so a
     multi-tab demo cannot silently lose a (tab, language) pair. */
  function showTheory(tab) {
    const all = document.querySelectorAll('.tc');
    all.forEach(el => el.classList.remove('active'));
    const want = [...all].filter(el =>
      el.dataset.lang === lang && (tab === undefined || el.dataset.tab === tab));
    (want.length ? want : [...all].filter(el => el.dataset.lang === lang))
      .slice(0, 1).forEach(el => el.classList.add('active'));
  }

  function setLang(next, tab, fireChange = true) {
    lang = next;
    document.documentElement.lang = lang;
    clearActive('.lang-btn');
    const btn = document.querySelector(`.lang-btn[data-lang="${lang}"]`);
    if (btn) btn.classList.add('active');
    showTheory(tab);
    applyI18n();
    if (fireChange && onLangChange) onLangChange(lang);
  }

  /* The initial pass deliberately does NOT fire onChange. Demos wire onChange to
     their own render(), and firing it here runs that render before the demo has
     finished constructing its state — twice now that meant a page that threw on
     load (a const still in its temporal dead zone; a data object still null).
     The demo renders itself once, after init, when it is ready. */
  function initI18n(t, opts = {}) {
    table = t;
    onLangChange = opts.onChange || null;
    document.querySelectorAll('.lang-btn').forEach(b =>
      b.addEventListener('click', () => setLang(b.dataset.lang, opts.tab && opts.tab())));
    setLang(opts.initial || 'en', opts.tab && opts.tab(), false);
  }

  /* ── theory height ──
     Reserve room for the TALLEST translation, not the one that happens to be
     showing: Russian runs ~20% longer than English (§3.5). Measure only after
     the fonts settle (§3.6), and re-measure across the responsive breakpoint,
     which changes .tc font sizes (round-2 finding D2). */
  function lockTheoryHeight(tab) {
    const box = document.querySelector('.theory');
    if (!box) return;
    box.style.height = ''; box.style.minHeight = '';
    if (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) return;

    const blocks = [...document.querySelectorAll('.tc')]
      .filter(el => tab === undefined || el.dataset.tab === undefined || el.dataset.tab === tab);
    const shown = document.querySelector('.tc.active');
    let maxH = 0;
    blocks.forEach(b => {
      const was = b.classList.contains('active');
      b.classList.add('active');
      maxH = Math.max(maxH, b.scrollHeight);
      if (!was) b.classList.remove('active');
    });
    if (shown) shown.classList.add('active');
    if (maxH <= 0) return;

    const sw = box.querySelector('.lang-sw');
    const cs = getComputedStyle(box);
    const pad = parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0);
    box.style.minHeight = (maxH + (sw ? sw.offsetHeight : 0) + 6 + pad) + 'px';
    box.style.overflowY = 'auto';   // scroll rather than clip if space runs short
  }

  function autoLockTheory(getTab) {
    const fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    const run = () => requestAnimationFrame(() => lockTheoryHeight(getTab && getTab()));
    fonts.then(run);
    let t = null;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(run, 150); });
  }

  /* ── keyboard ──
     A focused button handles Space itself; without excluding it the native
     activation and the handler fight, and the toggle silently no-ops (§3.7). */
  function onKey(map) {
    document.addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('button, input, textarea, select, [contenteditable]')) return;
      const fn = map[e.key];
      if (fn) { e.preventDefault(); fn(e); }
    });
  }

  /* ── animation ──
     dt is clamped: a backgrounded tab resumes with a huge delta that would
     otherwise teleport the simulation. */
  function loop(step) {
    let last = 0;
    const frame = now => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      step(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* ── canvas helpers ── */
  function axes(ctx, co, label) {
    ctx.strokeStyle = 'rgba(136,153,170,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(co.l, co.b); ctx.lineTo(co.r, co.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(co.l, co.t); ctx.lineTo(co.l, co.b); ctx.stroke();
    if (label) {
      ctx.font = '600 8px system-ui, sans-serif'; ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(160,178,196,0.9)';
      ctx.fillText(label, co.r, co.t - 6);
    }
  }
  function frame(ctx, dim, pad) {
    ctx.fillStyle = BG; ctx.fillRect(0, 0, dim.w, dim.h);
    return {
      l: pad.l, r: dim.w - pad.r, t: pad.t, b: dim.h - pad.b,
      w: dim.w - pad.l - pad.r, h: dim.h - pad.t - pad.b,
    };
  }

  const fmt = (v, d = 1) => (v * 100).toFixed(d) + '%';

  return {
    $, clearActive,
    BLUE, AMBER, STEEL, TEAL, RED, VIOLET, BG, rgb,
    drawGlow, sizeCanvas, axes, frame, fmt,
    T, TF, applyI18n, setLang, initI18n, showTheory,
    lockTheoryHeight, autoLockTheory, onKey, loop,
    get lang() { return lang; },
  };
})();
