/* Build a demo from src/ into its shipping location.

   Source files stay readable: they carry raw LaTeX and two placeholders for the
   shared kit. The build inlines the kit, pre-renders every formula with KaTeX,
   and embeds the stylesheet plus only the woff2 faces those formulas actually
   use — so the shipped file has zero external references and works offline.

   Usage:
     node tools/build.js <vendor-dir> [src/foo.html ...]

   <vendor-dir> must contain katex.min.js, katex.min.css and fonts/.
   Each source declares its destination with:  <!-- OUT: Some Folder/name.html -->
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = process.argv[2];
if (!VENDOR) { console.error('usage: node tools/build.js <vendor-dir> [src/*.html]'); process.exit(1); }

// ── load KaTeX in a sandbox ──
const sandbox = { window: {}, document: { createElement: () => ({ style: {} }) }, module: {}, exports: {} };
sandbox.self = sandbox.window; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(VENDOR, 'katex.min.js'), 'utf8'), sandbox, { filename: 'katex.min.js' });
const katex = sandbox.katex || sandbox.module.exports;
if (!katex || !katex.renderToString) throw new Error('katex did not load');

const sources = process.argv.slice(3).length
  ? process.argv.slice(3)
  : fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.html')).map(f => 'src/' + f);

const KIT_CSS = fs.readFileSync(path.join(ROOT, 'shared/kit.css'), 'utf8');
const KIT_JS = fs.readFileSync(path.join(ROOT, 'shared/kit.js'), 'utf8');

const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const escAttr = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const usedClasses = new Set();
let rendered = 0;
const failures = [];

function renderTex(tex, display) {
  try {
    const html = katex.renderToString(tex, { throwOnError: true, displayMode: display });
    rendered++;
    for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach(c => usedClasses.add(c));
    return html;
  } catch (e) { failures.push(`${display ? 'block' : 'inline'}: ${tex} -> ${e.message}`); return null; }
}

/* [\s\S]*? and not [^<]* — a formula containing a literal "<" (say "f < f_N")
   silently fails to match a [^<]* body and ships as raw LaTeX (§6bis.11). */
const SPAN_RE = /<span class="(k|k-block)">([\s\S]*?)<\/span>/g;

const staged = [];
for (const rel of sources) {
  let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const out = (src.match(/<!--\s*OUT:\s*(.+?)\s*-->/) || [])[1];
  if (!out) throw new Error(`${rel}: missing <!-- OUT: path --> directive`);

  src = src.replace(SPAN_RE, (all, cls, body) => {
    const tex = unesc(body);
    const html = renderTex(tex, cls === 'k-block');
    return html === null ? all : `<span class="${cls}" data-tex="${escAttr(tex)}">${html}</span>`;
  });

  staged.push({ rel, out, src });
}

if (failures.length) {
  console.error('LaTeX KaTeX refused to parse:');
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}

// ── which font faces are actually needed ──
const CLASS_FONT = {
  mathnormal: 'Math-Italic', mathdefault: 'Math-Italic', mathit: 'Main-Italic',
  mathrm: 'Main-Regular', textrm: 'Main-Regular', mathbf: 'Main-Bold', textbf: 'Main-Bold',
  boldsymbol: 'Math-BoldItalic', mathbb: 'AMS-Regular', amsrm: 'AMS-Regular',
  mathcal: 'Caligraphic-Regular', mathscr: 'Script-Regular', mathfrak: 'Fraktur-Regular',
  mathsf: 'SansSerif-Regular', textsf: 'SansSerif-Regular',
  mathtt: 'Typewriter-Regular', texttt: 'Typewriter-Regular',
};
const fonts = new Set(['Main-Regular', 'Math-Italic']);
for (const c of usedClasses) {
  if (CLASS_FONT[c]) fonts.add(CLASS_FONT[c]);
  const m = /^size([1-4])$/.exec(c);
  if (m) fonts.add(`Size${m[1]}-Regular`);
  if (c === 'delimsizing' || c === 'delim-size1') fonts.add('Size1-Regular');
  if (c === 'delim-size4') fonts.add('Size4-Regular');
  if (c === 'sqrt' || c === 'op-symbol' || c === 'large-op') { fonts.add('Size1-Regular'); fonts.add('Size2-Regular'); }
}
['Size1-Regular', 'Size2-Regular', 'Size3-Regular', 'Size4-Regular'].forEach(f => fonts.add(f)); // stretchy delimiters

let css = fs.readFileSync(path.join(VENDOR, 'katex.min.css'), 'utf8');
const kept = [];
css = css.replace(/@font-face\{[^}]*\}/g, block => {
  const m = /url\(fonts\/KaTeX_([A-Za-z0-9-]+)\.woff2\)/.exec(block);
  if (!m || !fonts.has(m[1])) return '';
  const b64 = fs.readFileSync(path.join(VENDOR, 'fonts', `KaTeX_${m[1]}.woff2`)).toString('base64');
  kept.push(m[1]);
  return block
    .replace(/src:[^;}]*/, `src:url(data:font/woff2;base64,${b64}) format("woff2")`)
    .replace(/url\(fonts\/[^)]*\)\s*format\("woff"\),?/g, '')
    .replace(/url\(fonts\/[^)]*\)\s*format\("truetype"\),?/g, '');
});

/* A face referenced by a rule but not embedded renders in a fallback font.
   Warn rather than ship it silently (round-2 latent finding). */
for (const [cls, face] of Object.entries(CLASS_FONT)) {
  if (usedClasses.has(cls) && !kept.includes(face)) console.warn(`  ! class .${cls} needs ${face}, which is NOT embedded`);
}

// ── emit ──
console.log('');
for (const { rel, out, src } of staged) {
  let html = src
    .replace('/*KIT-CSS*/', KIT_CSS)
    .replace('/*KIT-JS*/', KIT_JS)
    .replace(/<!--\s*OUT:.*?-->\s*/g, '');

  if (html.includes('/*KIT-CSS*/') || html.includes('/*KIT-JS*/')) throw new Error(rel + ': kit placeholder left behind');
  if (!html.includes('KaTeX_Main')) {
    html = html.replace(/<style>\r?\n/, `<style>\n/* KaTeX 0.16.9 — trimmed to the faces these formulas use, inlined for offline use */\n${css}\n`);
  }

  const leftover = [...html.matchAll(SPAN_RE)].filter(m => !m[2].includes('class="katex'));
  if (leftover.length) throw new Error(`${rel}: ${leftover.length} formula(s) still raw: ${leftover[0][2].slice(0, 50)}`);
  const ctrl = [...html].some(c => c.charCodeAt(0) < 32 && !'\n\r\t'.includes(c));
  if (ctrl) throw new Error(rel + ': control characters in output');

  const dest = path.join(ROOT, out);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html.replace(/\r\n/g, '\n'));
  console.log(`  ${rel}  ->  ${out}   ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)} KB`);
}
console.log(`\n${rendered} formulas rendered, 0 failures`);
console.log(`fonts inlined (${kept.length}): ${kept.sort().join(', ')}`);
