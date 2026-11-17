// Fails when a line of the app has no French or Russian translation.
//
// Every line a person can read goes through t(), tn() or msg() in the code. This reads the code, lists those
// lines, and compares them with the dictionaries in src/i18n. Run it with --unused to also list dictionary
// entries that no line uses any more, and with --json to print the missing lines for translating.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(import.meta.url)('typescript');

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === 'node_modules' || name === 'web' || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/i18n[\\/](fr|ru)(\.more)?\.ts$/.test(p)) files.push(p);
  }
};
walk(path.join(root, 'src'));
walk(path.join(root, 'apps', 'mobile'));

const parse = (file) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const text = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);

/** key → where it is used; `pairs` holds the two forms of each counted line. */
const used = new Map();
const pairs = [];
for (const file of files) {
  const sf = parse(file);
  const names = new Map(); // local name → which i18n function it is
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !/i18n(\/index)?$/.test(st.moduleSpecifier.text) || !st.importClause?.namedBindings) continue;
    for (const el of st.importClause.namedBindings.elements ?? []) names.set(el.name.text, (el.propertyName ?? el.name).text);
  }
  // inside the i18n module itself the functions go by their own names
  if (/i18n[\\/]index\.ts$/.test(file)) for (const f of ['t', 'tn', 'msg']) names.set(f, f);
  if (!names.size) continue;
  const where = path.relative(root, file);
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const fn = names.get(n.expression.text);
      const add = (k) => k !== null && used.set(k, where);
      if (fn === 't' || fn === 'msg') {
        const a = n.arguments[0];
        // t(a ? 'x' : 'y'): both lines count
        const each = (e) => (e && ts.isConditionalExpression(e) ? (each(e.whenTrue), each(e.whenFalse)) : add(text(e)));
        each(a);
      } else if (fn === 'tn') {
        const one = text(n.arguments[1]);
        const other = text(n.arguments[2]);
        add(one);
        add(other);
        if (one !== null && other !== null) pairs.push([one, other]);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const dict = (...names) => {
  const out = {};
  for (const name of names) {
    const sf = parse(path.join(root, 'src', 'i18n', name));
    const visit = (n) => {
      if (ts.isPropertyAssignment(n)) {
        const k = ts.isIdentifier(n.name) ? n.name.text : text(n.name);
        const v = text(n.initializer);
        if (k !== null && v !== null) out[k] = v;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
};
const fr = dict('fr.more.ts', 'fr.ts');
const ru = dict('ru.more.ts', 'ru.ts');

// in Russian a counted line may live under its plural alone, as "one|few|many"
const ruForms = new Set(pairs.filter(([, other]) => (ru[other] ?? '').split('|').length === 3).flatMap(([one, other]) => [one, other]));
const missing = { fr: [...used.keys()].filter((k) => !(k in fr)), ru: [...used.keys()].filter((k) => !(k in ru) && !ruForms.has(k)) };
// a value named in the English must be named in the translation too
const slots = (s) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join();
const broken = [];
for (const [lang, d] of [['fr', fr], ['ru', ru]]) for (const k of used.keys()) if (k in d && !d[k].split('|').every((form) => slots(form) === slots(k))) broken.push(`${lang}: ${k}`);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify([...new Set([...missing.fr, ...missing.ru])]));
} else {
  for (const lang of ['fr', 'ru']) for (const k of missing[lang]) console.log(`no ${lang} translation: ${JSON.stringify(k)}  (${used.get(k)})`);
  for (const b of broken) console.log(`values do not match: ${b}`);
  if (process.argv.includes('--unused')) for (const k of Object.keys(fr)) if (!used.has(k)) console.log(`unused: ${JSON.stringify(k)}`);
  console.log(`${used.size} lines in the code, ${missing.fr.length} without French, ${missing.ru.length} without Russian, ${broken.length} with mismatched values.`);
}
process.exit(missing.fr.length || missing.ru.length || broken.length ? 1 : 0);
