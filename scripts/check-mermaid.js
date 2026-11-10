const fs = require('fs');

const md = fs.readFileSync('docs/system-architecture.md', 'utf8').replace(/\r\n/g, '\n');
const regex = /```mermaid\n([\s\S]*?)```/g;
let m;
let count = 0;
while ((m = regex.exec(md)) !== null) {
  count++;
  const lines = m[1].split('\n');
  for (let l of lines) {
    if (l.includes('|') && (l.includes('<') || l.includes('>') || l.includes('"'))) {
      console.log(`Diagram ${count}: ${l.trim()}`);
    }
  }
}
