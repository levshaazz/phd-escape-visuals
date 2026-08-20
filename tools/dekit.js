/* Strip from a src/ demo every CSS rule that shared/kit.css already provides.

   A rule is removed only when its declarations are byte-for-byte equivalent to
   the kit's. Where they differ the rule is KEPT and reported, because that is a
   deliberate override (or a discrepancy worth looking at) and deleting it would
   silently change how the demo looks.

   usage: node tools/dekit.js src/foo.html [--apply]
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) { console.error('usage: node tools/dekit.js src/foo.html [--apply]'); process.exit(1); }

/* Split a stylesheet into top-level rules by brace matching. @media blocks are
   returned whole so their contents are never confused with top-level rules. */
function rules(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    // skip comments and whitespace
    if (css.startsWith('/*', i)) { const e = css.indexOf('*/', i); i = e < 0 ? css.length : e + 2; continue; }
    if (/\s/.test(css[i])) { i++; continue; }
    const braceAt = css.indexOf('{', i);
    if (braceAt < 0) break;
    let depth = 0, j = braceAt;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    out.push({ selector: css.slice(i, braceAt).trim().replace(/\s+/g, ' '), whole: css.slice(i, j),
               body: css.slice(braceAt + 1, j - 1) });
    i = j;
  }
  return out;
}
const kitCss = fs.readFileSync(path.join(ROOT, 'shared/kit.css'), 'utf8');

/* Resolve var(--x) against the kit's :root, so `color:#e8ecf0` and
   `color:var(--text)` compare equal — otherwise almost every rule looks like a
   deliberate override when it is only a different spelling of the same value. */
const VARS = new Map();
{
  const root = rules(kitCss).find(r => r.selector === ':root');
  if (root) for (const m of root.body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) VARS.set(m[1], m[2].trim());
}
const resolveVars = s => s.replace(/var\(--([\w-]+)\)/g, (all, n) => VARS.has(n) ? VARS.get(n) : all);

/* prop -> value, comments and whitespace removed */
function decls(body) {
  const out = new Map();
  const clean = resolveVars(body).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const part of clean.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k.startsWith('@')) continue;
    out.set(k, part.slice(i + 1).trim().replace(/\s+/g, ' ').toLowerCase());
  }
  return out;
}
/* A demo rule is redundant when the kit already says everything it says. It may
   say LESS than the kit (the demo simply inherits the extra), but never anything
   different — that would be an override and is kept. */
function subsumed(demoBody, kitBody) {
  const d = decls(demoBody), k = decls(kitBody);
  if (!d.size) return false;
  for (const [prop, val] of d) if (k.get(prop) !== val) return false;
  return true;
}
function mediaSubsumed(demoWhole, kitWhole) {
  const inner = w => rules(w.slice(w.indexOf('{') + 1, w.lastIndexOf('}')));
  const kitInner = new Map(inner(kitWhole).map(r => [r.selector, r.body]));
  const di = inner(demoWhole);
  if (!di.length) return false;
  for (const r of di) {
    if (!kitInner.has(r.selector)) return false;
    if (!subsumed(r.body, kitInner.get(r.selector))) return false;
  }
  return true;
}

const kitRules = new Map();
for (const r of rules(kitCss)) {
  if (!kitRules.has(r.selector)) kitRules.set(r.selector, []);
  kitRules.get(r.selector).push(r);
}

const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
const sm = /<style>\n([\s\S]*?)<\/style>/.exec(src);
if (!sm) throw new Error('no <style> block');
const demoCss = sm[1].replace('/*KIT-CSS*/', '');

const dropped = [], kept = [], overrides = [];
let outCss = demoCss;
for (const r of rules(demoCss)) {
  const kit = kitRules.get(r.selector);
  if (!kit) { kept.push(r.selector); continue; }
  const isMedia = r.selector.startsWith('@');
  const ok = kit.some(k => isMedia ? mediaSubsumed(r.whole, k.whole) : subsumed(r.body, k.body));
  if (ok) {
    dropped.push(r.selector);
    outCss = outCss.replace(r.whole, '');
  } else {
    const d = [...decls(r.body)], k = [...decls(kit[0].body)];
    const diff = d.filter(([p, v]) => decls(kit[0].body).get(p) !== v)
                  .map(([p, v]) => `${p}: ${v}  (kit: ${decls(kit[0].body).get(p) ?? '—'})`);
    overrides.push({ sel: r.selector, diff: isMedia ? ['(media block)'] : diff });
    void k;
  }
}

outCss = outCss.replace(/\n{3,}/g, '\n\n').replace(/^\s*\n/, '');

console.log(`\n${file}`);
console.log(`  identical to kit, removed (${dropped.length}): ${dropped.join(', ') || '-'}`);
console.log(`  demo-specific, kept (${kept.length}): ${kept.slice(0, 14).join(', ')}${kept.length > 14 ? ' …' : ''}`);
if (overrides.length) {
  console.log(`  SAME SELECTOR, DIFFERENT VALUES (${overrides.length}) — review each:`);
  for (const o of overrides) console.log(`    ${o.sel}  ->  ${o.diff.join(' | ')}`);
}

if (apply) {
  fs.writeFileSync(path.join(ROOT, file), src.replace(sm[1], '/*KIT-CSS*/\n' + outCss));
  console.log(`  written (${(Buffer.byteLength(outCss) / 1024).toFixed(1)} KB of demo-specific CSS left)`);
}
