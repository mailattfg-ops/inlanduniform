const fs = require('fs');
const path = require('path');

function getFiles(dir, exts, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (f === 'node_modules' || f === '.git' || f === '.next') continue;
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) getFiles(full, exts, list);
      else if (exts.some(e => full.endsWith(e))) list.push(full);
    } catch(e) {}
  }
  return list;
}

const files = [
  ...getFiles('./controllers', ['.js']),
  ...getFiles('./services', ['.js']),
  ...getFiles('./routes', ['.js']),
  ...getFiles('./utils', ['.js']),
  ...getFiles('../frontend/src', ['.ts', '.tsx', '.js'])
];

const tables = new Set();
const tableRegex = /\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = tableRegex.exec(content)) !== null) {
    tables.add(m[1]);
  }
}

console.log(JSON.stringify(Array.from(tables).sort(), null, 2));
