/* Recover an editable src/ file from a shipped demo.

   The four original demos were built in place: KaTeX was pre-rendered into them
   and its stylesheet inlined, so the readable source no longer exists. This
   undoes exactly that — the `data-tex` attributes still carry the original
   LaTeX, and the inlined stylesheet sits in a single identifiable block.

   What it does NOT do is deduplicate the CSS/JS against shared/kit.* — that is a
   judgement call and is done by hand afterwards.

   usage: node tools/extract.js "<shipped path>" src/<name>.html
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const [rel, out] = process.argv.slice(2);
if (!rel || !out) { console.error('usage: node tools/extract.js <shipped> <src>'); process.exit(1); }

let html = fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── 1. drop the inlined KaTeX stylesheet ──
const kStart = html.indexOf('/* KaTeX');
if (kStart >= 0) {
  // the demo's own CSS resumes at its first top-level rule
  const after = html.slice(kStart);
  const m = /\n(  (?:\*|:root|body|html)\s*\{)/.exec(after);
  if (!m) throw new Error('could not find where the demo CSS resumes');
  html = html.slice(0, kStart) + after.slice(m.index + 1);
  console.log('  removed inlined KaTeX CSS');
}

// ── 2. un-render the formulas ──
/* The rendered markup nests <span>s, so this scans for the matching close tag
   rather than trying to express balance in a regex. */
function unrender(src) {
  const open = /<span class="(k|k-block)" data-tex="([^"]*)">/g;
  let outStr = '', last = 0, m, n = 0;
  while ((m = open.exec(src))) {
    const bodyStart = m.index + m[0].length;
    let depth = 1, i = bodyStart;
    while (depth > 0) {
      const nextOpen = src.indexOf('<span', i);
      const nextClose = src.indexOf('</span>', i);
      if (nextClose < 0) throw new Error('unbalanced span');
      if (nextOpen >= 0 && nextOpen < nextClose) { depth++; i = nextOpen + 5; }
      else { depth--; i = nextClose + 7; }
    }
    const tex = m[2].replace(/&quot;/g, '"').replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    outStr += src.slice(last, m.index) + `<span class="${m[1]}">${tex}</span>`;
    last = i; open.lastIndex = i; n++;
  }
  outStr += src.slice(last);
  console.log(`  un-rendered ${n} formulas`);
  return outStr;
}
html = unrender(html);

// ── 3. put the kit placeholder back and record the destination ──
html = html.replace(/<style>\n/, '<style>\n/*KIT-CSS*/\n\n');
html = `<!-- OUT: ${rel} -->\n` + html;

fs.mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true });
fs.writeFileSync(path.join(ROOT, out), html);
console.log(`  ${rel}\n  -> ${out}   ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)} KB`);
console.log('  NEXT: delete the CSS/JS that shared/kit.* already provides, and add /*KIT-JS*/');
