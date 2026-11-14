import { readFileSync } from 'node:fs';
import { readDocx } from '../src/ingest/docx';
import { readPdfWith } from '../src/ingest/pdf';
import { structureDoc } from '../src/ingest/structure';

const file = process.argv[2];
const verbose = process.argv.includes('-v');
const data = new Uint8Array(readFileSync(file));
const raw = file.endsWith('.docx')
  ? await readDocx(data, file.split('/').pop()!)
  : await readPdfWith(await import('pdfjs-dist/legacy/build/pdf.mjs') as any, data, file.split('/').pop()!);
if (process.argv.includes('--raw')) {
  for (const p of raw.paras.slice(0, 90)) console.log(`[${p.level ?? ' '}${p.list ? 'L' : ' '}${p.bold ? 'B' : ' '}${p.math ? 'M' : ' '} ${(p.scale ?? 1).toFixed(2)}] ${p.text}`);
}
const doc = structureDoc(raw);
console.log(`\n=== ${doc.title} (${doc.kind}, pages=${doc.pages}) warnings=${JSON.stringify(doc.warnings)}`);
for (const u of doc.units) {
  console.log(`\n# ${u.title}`);
  for (const t of u.topics) {
    console.log(`  ## ${t.title}  [${t.concepts.join(', ')}]  blocks=${t.blocks.map((b) => b.t).join(',')}`);
    if (verbose) for (const b of t.blocks) console.log('      ', b.t, JSON.stringify('text' in b ? b.text : b.t === 'list' ? b.items : b.lines).slice(0, 150));
    for (const e of t.exercises) console.log(`     • ${e.kind.padEnd(10)} ${e.given || '(open) ' + e.prompt}   {${e.concepts.join(',')}}`);
  }
}
