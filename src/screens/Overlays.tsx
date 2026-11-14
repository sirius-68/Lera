import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../ai/client';
import { localAnswer } from '../ai/offline';
import { aiReady } from '../ai/providers';
import { aiChat } from '../ai/tasks';
import { CONCEPTS } from '../engine/concepts';
import { PLAIN } from '../engine/concepts-calc';
import { practiceFor, seedFrom } from '../engine/generate';
import { ConceptId, Problem } from '../engine/types';
import { Lera } from '../mascot/Lera';
import { actions, useStore } from '../store';
import { dayOf, findTopic, statusOf } from '../store/learner';
import { closeOverlay, go, openOverlay } from '../store/nav';
import { Button3D, Sheet, haptic } from '../ui/kit';
import { Icon } from '../ui/icons';
import { MathView, RichText } from '../ui/math';

/* ───────────── three-minute review ───────────── */

function Arrowed({ text }: { text: string }) {
  const parts = text.split('→').map((s) => s.trim());
  return (
    <span className="arrowed">
      {parts.map((p, i) => (
        <span key={i} className="row" style={{ gap: 8 }}>
          {i > 0 && <Icon name="arrow" size={15} />}
          <MathView text={p} />
        </span>
      ))}
    </span>
  );
}

export function ReviewSheet({ concept }: { concept: ConceptId }) {
  const c = CONCEPTS[concept];
  const state = useStore((s) => s.concepts[concept]);
  const [shown, setShown] = useState(0);
  const said = useStore((s) => s.understood[concept]);
  const [sense, setSense] = useState<'yes' | 'no' | null>(null);
  const status = statusOf(state);
  const total = c.example.steps.length;

  useEffect(() => {
    actions.reviewed(concept);
  }, [concept]);

  const practise = () => {
    const problems = practiceFor(concept, 3, seedFrom(`${dayOf()}:${concept}:${Date.now() % 997}`), 'review');
    closeOverlay();
    go({ name: 'session', problems, title: `Review: ${c.title}` });
  };

  return (
    <Sheet onClose={closeOverlay} full label={`Review: ${c.title}`}>
      <div className="sheet-body stagger" style={{ flex: 1 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className={`chip ${status === 'gap' ? 'gap' : status === 'shaky' ? 'slip' : status === 'solid' ? 'ok' : ''}`}>
            {status === 'gap' ? 'Gap' : status === 'shaky' ? 'Shaky' : status === 'solid' ? 'Solid' : 'Review'}
          </span>
          <span className="chip plain"><Icon name="clock" size={13} /> {c.minutes} min</span>
        </div>
        <h2 className="review-h">{c.title}</h2>
        {state?.lastTitle && (
          <p className="why-here">
            <Icon name="target" size={16} />
            <span>You’re here because: <RichText text={state.lastTitle} /></span>
          </p>
        )}
        <div className="plain-card">
          <span className="label">In plain words</span>
          <p><RichText text={PLAIN[concept]} /></p>
        </div>
        {c.explain.map((p, i) => (
          <p key={i} className="review-p"><RichText text={p} /></p>
        ))}

        {c.trap && (
          <div className="trap">
            <span className="label">The usual trap</span>
            <div className="trap-row wrong">
              <span className="trap-ic"><Icon name="close" size={14} stroke={3} /></span>
              <Arrowed text={c.trap.wrong} />
            </div>
            <div className="trap-row right">
              <span className="trap-ic"><Icon name="check" size={14} stroke={3} /></span>
              <Arrowed text={c.trap.right} />
            </div>
            <p className="muted" style={{ fontSize: 14, marginTop: 8 }}><RichText text={c.trap.note} /></p>
          </div>
        )}

        <div className="card" style={{ marginTop: 16 }}>
          <span className="label">Worked example</span>
          <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>{c.example.prompt}</p>
          <div style={{ fontSize: 19, margin: '6px 0 4px' }}><MathView text={c.example.given} block /></div>
          <ol className="route">
            {c.example.steps.slice(0, shown).map((s, i) => (
              <li key={i}>
                <MathView text={s.line} block />
                <span className="muted"><RichText text={s.why} /></span>
              </li>
            ))}
          </ol>
          {shown < total ? (
            <button
              className="reveal"
              onClick={() => {
                haptic(6);
                setShown(shown + 1);
              }}
            >
              {shown === 0 ? 'What’s the first step? Think, then tap' : 'Next step'} <Icon name="down" size={16} />
            </button>
          ) : (
            <p className="chip ok" style={{ marginTop: 10 }}><Icon name="check" size={13} stroke={3} /> That’s the whole route</p>
          )}
        </div>

        <div className="sense block" data-state={sense ?? 'ask'}>
          {sense === null && (
            <>
              <span>{said === 'no' ? 'Does it make sense now?' : 'Did that make sense?'}</span>
              <button onClick={() => { haptic(5); setSense('yes'); actions.setUnderstood(concept, true); }}>Yes</button>
              <button onClick={() => { haptic(5); setSense('no'); actions.setUnderstood(concept, false); setShown(0); }}>Not really</button>
            </>
          )}
          {sense === 'yes' && <span className="sense-ok"><Icon name="check" size={14} stroke={3} /> Good. Now prove it to yourself with three quick ones.</span>}
          {sense === 'no' && (
            <div className="plainer">
              <p>That’s fine — it means we go slower, not that you can’t do it. Read the <b>plain words</b> box at the top once more, then tap through the worked example one step at a time, guessing each step before you reveal it.</p>
              <button className="review-link" onClick={() => openOverlay({ name: 'ask', seed: `I don’t understand ${c.title.toLowerCase()}. Can you explain it more simply?` })}>
                <Icon name="chat" size={15} />
                <span>Ask Lera about this</span>
                <Icon name="chevron" size={15} />
              </button>
            </div>
          )}
        </div>

        <div className="center" style={{ gap: 6, marginTop: 20 }}>
          <Button3D sheen onClick={practise}>
            <Icon name="pencil" size={18} /> Try 3 quick ones
          </Button3D>
          <p className="faint" style={{ fontSize: 13 }}>Checked line by line, like everything else.</p>
        </div>
      </div>
    </Sheet>
  );
}

/* ───────────── ask Lera ───────────── */

interface AskProps {
  topicId?: string;
  seed?: string;
  problem?: Problem;
  lines?: string[];
}

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  via?: 'ai' | 'local' | 'error';
}

export function AskSheet({ topicId, seed, problem, lines }: AskProps) {
  const ai = useStore((s) => s.ai);
  const docs = useStore((s) => s.docs);
  const found = findTopic(docs, topicId);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement | null>(null);
  const sent = useRef(false);
  const online = aiReady(ai);

  const excerpt = found
    ? found.topic.blocks
        .map((b) => (b.t === 'list' ? b.items.join(' ') : b.t === 'example' ? b.lines.join(' ') : b.text))
        .join('\n')
        .slice(0, 1200)
    : undefined;

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history: Msg[] = [...msgs, { role: 'user', text: q }];
    setMsgs(history);
    setText('');
    setBusy(true);
    let reply: Msg;
    if (online) {
      try {
        const chat: ChatMessage[] = history.map((m) => ({ role: m.role, content: m.text }));
        reply = { role: 'assistant', via: 'ai', text: await aiChat(ai, chat, { topic: found?.topic.title, problem, lines, notesExcerpt: excerpt }) };
      } catch (e) {
        const local = localAnswer(q, { glossary: found?.doc.glossary, problem, lines, topicTitle: found?.topic.title });
        reply = { role: 'assistant', via: 'error', text: `${e instanceof Error ? e.message : 'The AI model didn’t answer.'}\n\nHere’s what I can say on my own:\n\n${local}` };
      }
    } else {
      await new Promise((r) => setTimeout(r, 550));
      reply = { role: 'assistant', via: 'local', text: localAnswer(q, { glossary: found?.doc.glossary, problem, lines, topicTitle: found?.topic.title }) };
    }
    setMsgs([...history, reply]);
    setBusy(false);
  };

  useEffect(() => {
    if (seed && !sent.current) {
      sent.current = true;
      void ask(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length, busy]);

  const quick = problem ? ['Give me a hint', 'What should I do first?'] : found ? [`Explain “${found.topic.title}” simply`, 'What is a coefficient?', 'What are like terms?'] : ['What is a coefficient?', 'Why do signs flip?', 'How do I factorise?'];

  return (
    <Sheet onClose={closeOverlay} full label="Ask Lera">
      <div className="ask">
        <div className="row" style={{ padding: '0 20px 8px', gap: 10 }}>
          <Lera size={44} mood={busy ? 'thinking' : 'idle'} />
          <div className="grow">
            <b style={{ fontSize: 17 }}>Ask Lera</b>
            <p className="faint" style={{ fontSize: 12.5 }}>
              {online ? `Answering with ${ai.model}` : 'Built-in answers · connect an AI model in Settings for open questions'}
            </p>
          </div>
        </div>
        <div className="ask-list" ref={list}>
          {msgs.length === 0 && !busy && (
            <div className="center" style={{ gap: 10, padding: '18px 10px' }}>
              <p className="muted" style={{ fontSize: 15, maxWidth: 280, lineHeight: 1.5 }}>
                {problem ? 'Stuck on this problem? Ask, and I’ll point at the idea — not the answer.' : 'Ask about anything in your notes.'}
              </p>
              <div className="col" style={{ gap: 8, alignSelf: 'stretch' }}>
                {quick.map((qk) => (
                  <button key={qk} className="quick" onClick={() => ask(qk)}>
                    {qk}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.text.split(/\n{2,}/).map((para, j) => (
                <p key={j}><RichText text={para} /></p>
              ))}
            </div>
          ))}
          {busy && (
            <div className="msg assistant typing" aria-label="Lera is thinking">
              <i /><i /><i />
            </div>
          )}
        </div>
        <form
          className="ask-form"
          onSubmit={(e: { preventDefault(): void }) => {
            e.preventDefault();
            void ask(text);
          }}
        >
          <input className="field" placeholder="Ask a question…" value={text} onChange={(e: { target: { value: string } }) => setText(e.target.value)} aria-label="Your question" />
          <button type="submit" className="send" disabled={!text.trim() || busy} aria-label="Send">
            <Icon name="arrow" size={20} />
          </button>
        </form>
      </div>
    </Sheet>
  );
}
