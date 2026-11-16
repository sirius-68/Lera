// Asks the live router one request of each kind, the way the app does, and prints how long each took,
// which models were tried and how much came back. Run by the deploy workflow; LERA_AI_URL is the router's address.
const url = process.env.LERA_AI_URL;
const sys = 'You are Lera, a patient maths tutor. Be brief and concrete.';
const paras = Array.from({ length: 14 }, (_, i) => (i % 5 === 0 ? `${i / 5 + 1}. Section ${i / 5 + 1}: Linear equations part ${i}` : `To solve 3x + ${i} = ${i + 9}, subtract ${i} from both sides, then divide by 3. Exercise ${i}: Solve 2x - ${i} = 7.`));
const jobs = [
  ['simplify', 260, [{ role: 'system', content: sys }, { role: 'user', content: 'Explain again more simply: a term changes sign when it crosses the equals sign.' }]],
  ['diagnose', 220, [{ role: 'system', content: `${sys}\nReturn ONLY JSON: {"title": string, "message": string, "concept": string}` }, { role: 'user', content: 'Problem: Solve 2x - 8 = -4\nLine above: 2x - 8 = -4\nStudent line: x = 1' }]],
  ['chat', 320, [{ role: 'system', content: `${sys}\nAnswer in at most 80 words.` }, { role: 'user', content: 'Why do signs flip when I move a term across?' }]],
  ['checkOpen', 260, [{ role: 'system', content: `${sys}\nReturn ONLY JSON: {"correct": boolean, "feedback": string}` }, { role: 'user', content: 'Problem: A train travels 120 km in 2 hours. What is its speed?\nWorking:\n1. 120/2 = 60 km/h' }]],
  ['translate', 3200, [{ role: 'system', content: 'Translate into French. Return ONLY a JSON array of strings, same count, same order.' }, { role: 'user', content: JSON.stringify(paras.slice(0, 6)) }]],
  ['structure', undefined, [{ role: 'system', content: 'Arrange these textbook paragraphs. Return ONLY JSON: {"title": string, "units": [{"title": string, "topics": [{"title": string, "blocks": [{"t":"p","text":string}], "exercises": [string]}]}]}' }, { role: 'user', content: paras.map((p, i) => `[${i}] ${p}`).join('\n') }]],
];
for (const [task, max, messages] of jobs) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lera-device': 'probe', origin: 'https://lera.app.local' }, body: JSON.stringify({ model: 'auto', messages, temperature: 0.2, ...(max ? { max_tokens: max } : {}), lera: { task, level: 0 } }) });
    const text = await res.text();
    let d = {};
    try { d = JSON.parse(text); } catch {}
    const reply = d.choices?.[0]?.message?.content ?? '';
    console.log(`${task.padEnd(10)} ${String(Date.now() - t0).padStart(6)} ms  http ${res.status}  cors=${res.headers.get('access-control-allow-origin') ?? 'none'}  tried=${(d.tried ?? []).join(' > ')}  reply=${reply.length} chars  ${reply ? JSON.stringify(reply.slice(0, 90)) : text.slice(0, 200)}`);
  } catch (e) {
    console.log(`${task.padEnd(10)} ${String(Date.now() - t0).padStart(6)} ms  FAILED ${e.message}`);
  }
}
