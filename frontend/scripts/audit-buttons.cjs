const fs = require('fs');
const path = require('path');

function walk(d, acc = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(f)) acc.push(p);
  }
  return acc;
}

const root = path.resolve(__dirname, '../src');
const files = [...walk(path.join(root, 'features')), ...walk(path.join(root, 'components'))];
const rows = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const hasUseAuth = /useAuth\(\)/.test(src);
  const canCalls = (src.match(/\bcan\(['"]/g) || []).length;
  const muts = (src.match(/useMutation\(/g) || []).length;
  const posts = (src.match(/\.(post|put|patch|delete)\(/g) || []).length;
  if (muts > 0 || posts > 0) {
    rows.push({ file: path.relative(root, f).split(path.sep).join('/'), hasUseAuth, canCalls, muts, posts });
  }
}

rows.sort((a, b) => b.muts + b.posts - (a.muts + a.posts));
for (const r of rows) {
  console.log(
    `${r.hasUseAuth ? 'AUTH' : '----'} can=${String(r.canCalls).padStart(2)} mut=${String(r.muts).padStart(2)} http=${String(r.posts).padStart(2)}  ${r.file}`
  );
}
console.log(`\nfiles with writes: ${rows.length}, without useAuth: ${rows.filter((r) => !r.hasUseAuth).length}`);
