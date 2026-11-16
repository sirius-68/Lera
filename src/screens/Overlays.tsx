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
import { actions, getState, useStore } from '../store';
import { learnerContext } from '../store/insights';
import { dayOf, findTopic, statusOf } from '../store/learner';
import { closeOverlay, go, openOverlay } from '../store/nav';
import { ChatMsg } from '../store/types';
import { Button3D, Sheet, confirmDialog, haptic, leraReact, toast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { MathView, RichText } from '../ui/math';
import { Md } from '../ui/Md';

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
              <p>That’s fine, it means we go slower, not that you can’t do it. Read the <b>plain words</b> box at the top once more, then tap through the worked example one step at a time, guessing each step before you reveal it.</p>
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

type Msg = ChatMsg;
const NO_MSGS: Msg[] = [];
const mid = (): string => `m${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export function AskSheet({ topicId, seed, problem, lines }: AskProps) {
  const ai = useStore((s) => s.ai);
  const docs = useStore((s) => s.docs);
  const chats = useStore((s) => s.chats);
  // Conversations are kept as sessions, like any chat app: each has its own id, and the list of them is the history.
  // A session started from a lesson remembers the lesson ("t:<topic>:<time>"); older ones are keyed by the topic alone.
  const topicOf = (id: string): string | undefined => (id.startsWith('t:') ? id.slice(2, id.lastIndexOf(':')) : id.startsWith('c:') || id === 'general' ? undefined : id);
  const lastAt = (id: string): string => chats[id]?.[chats[id].length - 1]?.at ?? '';
  const sessions = Object.keys(chats).filter((id) => chats[id]?.length).sort((a, b) => lastAt(b).localeCompare(lastAt(a)));
  const fresh = (forTopic?: string) => (forTopic ? `t:${forTopic}:${Date.now()}` : `c:${Date.now()}`);
  const [thread, setThread] = useState<string>(() => {
    // from a lesson or a problem: carry on that lesson's latest chat; from the home screen: a new one
    const mine = topicId ? sessions.find((id) => topicOf(id) === topicId) : undefined;
    return mine && !seed ? mine : fresh(topicId);
  });
  // opened from the home screen with earlier chats: show them first
  const [showHistory, setShowHistory] = useState(() => !topicId && !seed && !problem && sessions.length > 0);
  const found = findTopic(docs, topicOf(thread) ?? (thread.startsWith('c:') ? undefined : topicId));
  const msgs = chats[thread] ?? NO_MSGS;
  const setMsgs = (next: Msg[]) => actions.setChat(thread, next);
  const titleOf = (id: string): string => (chats[id]?.find((m) => m.role === 'user')?.text ?? 'Chat').replace(/\*\*|\$/g, '').slice(0, 70);
  const whenOf = (id: string): string => {
    const at = lastAt(id);
    if (!at) return '';
    const d = new Date(at);
    const days = Math.round((new Date(new Date().toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
    return days <= 0 ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : days === 1 ? 'Yesterday' : days < 7 ? `${days} days ago` : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };
  const [openMsg, setOpenMsg] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement | null>(null);
  const sent = useRef(false);
  const online = aiReady(ai);

  const excerpt = found
    ? found.topic.blocks
        .map((b) => (b.t === 'list' ? b.items.join(' ') : b.t === 'example' ? b.lines.join(' ') : b.t === 'table' ? b.rows.map((r) => r.join(' | ')).join('\n') : b.text))
        .join('\n')
        .slice(0, 1200)
    : undefined;

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history: Msg[] = [...msgs, { id: mid(), role: 'user', text: q, at: new Date().toISOString() }];
    setShowHistory(false);
    setMsgs(history);
    actions.track('ask', found ? { topic: found.topic.id } : undefined);
    setText('');
    setBusy(true);
    let reply: Msg;
    if (online) {
      try {
        const chat: ChatMessage[] = history.map((m) => ({ role: m.role, content: m.text }));
        reply = { id: mid(), at: new Date().toISOString(), role: 'assistant', via: 'ai', text: await aiChat(ai, chat, { topic: found?.topic.title, problem, lines, notesExcerpt: excerpt, learner: learnerContext(getState()) }) };
      } catch (e) {
        const local = localAnswer(q, { glossary: found?.doc.glossary, problem, lines, topicTitle: found?.topic.title });
        reply = { id: mid(), at: new Date().toISOString(), role: 'assistant', via: 'error', text: `${e instanceof Error ? e.message : 'The AI model didn’t answer.'}\n\nHere’s what I can say on my own:\n\n${local}` };
      }
    } else {
      await new Promise((r) => setTimeout(r, 550));
      reply = { id: mid(), at: new Date().toISOString(), role: 'assistant', via: 'local', text: localAnswer(q, { glossary: found?.doc.glossary, problem, lines, topicTitle: found?.topic.title }) };
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

  const copyMsg = async (m: Msg) => {
    try {
      await navigator.clipboard.writeText(m.text.replace(/\*\*/g, '').replace(/\$/g, ''));
      toast('Copied');
    } catch {
      toast('Copying isn’t allowed here.');
    }
    setOpenMsg(null);
  };
  const saveMsg = (m: Msg) => {
    actions.save({ topicId: found?.topic.id ?? 'chat', topicTitle: found?.topic.title ?? 'Ask Lera', text: m.text.replace(/\*\*/g, '') });
    haptic([8, 30, 8]);
    leraReact('happy');
    toast('Saved to your notebook');
    setOpenMsg(null);
  };
  const shareMsg = async (m: Msg) => {
    const body = m.text.replace(/\*\*/g, '').replace(/\$/g, '');
    try {
      if (navigator.share) await navigator.share({ text: body });
      else await copyMsg(m);
    } catch {
      /* the share sheet was closed */
    }
    setOpenMsg(null);
  };
  const clearAll = async () => {
    if (await confirmDialog('Delete this chat?', { body: 'Its messages will be removed. Anything you saved to your notebook stays.', yes: 'Delete', danger: true })) {
      actions.clearChat(thread);
      setThread(fresh(topicOf(thread)));
    }
  };

  const quick = problem ? ['Give me a hint', 'What should I do first?'] : found ? [`Explain “${found.topic.title}” simply`, 'What is a coefficient?', 'What are like terms?'] : ['What is a coefficient?', 'Why do signs flip?', 'How do I factorise?'];

  return (
    <Sheet onClose={closeOverlay} full label="Ask Lera">
      <div className="ask">
        <div className="row" style={{ padding: '0 20px 8px', gap: 10 }}>
          <Lera size={44} mood={busy ? 'thinking' : 'idle'} />
          <div className="grow">
            <b style={{ fontSize: 17 }}>{showHistory ? 'Your chats' : 'Ask Lera'}</b>
            <p className="faint" style={{ fontSize: 12.5 }}>
              {showHistory ? `${sessions.length} saved ${sessions.length === 1 ? 'chat' : 'chats'}` : found ? found.topic.title : 'Anything in your notes'}
            </p>
          </div>
          {!showHistory && sessions.length > 0 && (
            <button className="iconbtn" onClick={() => { haptic(4); setShowHistory(true); }} aria-label="Chat history"><Icon name="clock" size={19} /></button>
          )}
          <button className="iconbtn" onClick={() => { haptic(4); setThread(fresh(showHistory ? undefined : topicOf(thread))); setShowHistory(false); }} aria-label="New chat"><Icon name="plus" size={20} /></button>
          {!showHistory && msgs.length > 0 && (
            <button className="iconbtn" onClick={clearAll} aria-label="Delete this chat"><Icon name="trash" size={18} /></button>
          )}
        </div>
        {showHistory && (
          <div className="ask-list chat-history">
            {sessions.map((id) => {
              const t = findTopic(docs, topicOf(id));
              return (
                <div key={id} className="chat-row">
                  <button className="grow" onClick={() => { haptic(4); setThread(id); setShowHistory(false); }}>
                    <b>{titleOf(id)}</b>
                    <span>{t ? `${t.topic.title} · ` : ''}{chats[id].length} messages · {whenOf(id)}</span>
                    <em>{(chats[id][chats[id].length - 1]?.text ?? '').replace(/\*\*|\$/g, '').slice(0, 90)}</em>
                  </button>
                  <button className="iconbtn" aria-label="Delete this chat" onClick={async () => { if (await confirmDialog('Delete this chat?', { yes: 'Delete', danger: true })) actions.clearChat(id); }}><Icon name="trash" size={17} /></button>
                </div>
              );
            })}
            {sessions.length === 0 && <p className="muted" style={{ textAlign: 'center', padding: 24 }}>No chats yet.</p>}
          </div>
        )}
        {!showHistory && <div className="ask-list" ref={list}>
          {msgs.length === 0 && !busy && (
            <div className="center" style={{ gap: 10, padding: '18px 10px' }}>
              <p className="muted" style={{ fontSize: 15, maxWidth: 280, lineHeight: 1.5 }}>
                {problem ? 'Stuck on this problem? Ask, and I’ll point at the idea, not the answer.' : 'Ask about anything in your notes.'}
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
            <div key={m.id ?? i} className={`msg-wrap ${m.role}`}>
              <button className={`msg ${m.role}`} onClick={() => { haptic(4); setOpenMsg(openMsg === m.id ? null : m.id); }} aria-expanded={openMsg === m.id} aria-label={`${m.role === 'user' ? 'Your message' : 'Lera’s answer'}. Tap for options.`}>
                <Md text={m.text} />
              </button>
              {openMsg === m.id && (
                <div className="msg-tools">
                  <button onClick={() => void copyMsg(m)}><Icon name="copy" size={15} /> Copy</button>
                  {m.role === 'assistant' && <button onClick={() => saveMsg(m)}><Icon name="bookmark" size={15} /> Save</button>}
                  <button onClick={() => void shareMsg(m)}><Icon name="share" size={15} /> Share</button>
                  {m.role === 'user' && <button onClick={() => { setOpenMsg(null); void ask(m.text); }}><Icon name="refresh" size={15} /> Ask again</button>}
                  <button onClick={() => { setMsgs(msgs.filter((x) => x.id !== m.id)); setOpenMsg(null); }}><Icon name="trash" size={15} /> Delete</button>
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="msg assistant typing" aria-label="Lera is thinking">
              <i /><i /><i />
            </div>
          )}
        </div>}
        <form
          className="ask-form"
          onSubmit={(e: { preventDefault(): void }) => {
            e.preventDefault();
            void ask(text);
          }}
        >
          <input className="field" placeholder={showHistory ? 'Start a new chat…' : 'Ask a question…'} value={text} onChange={(e: { target: { value: string } }) => setText(e.target.value)} aria-label="Your question" />
          <button type="submit" className="send" disabled={!text.trim() || busy} aria-label="Send">
            <Icon name="arrow" size={20} />
          </button>
        </form>
      </div>
    </Sheet>
  );
}
