import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { prettyInline } from '../ingest/text';
import { Block, LeraDoc } from '../ingest/types';
import { Lera } from '../mascot/Lera';
import { actions, useStore } from '../store';
import { back, go } from '../store/nav';
import { Highlight, Note, SavedItem } from '../store/types';
import { Icon } from '../ui/icons';
import { haptic, toast } from '../ui/kit';

/**
 * The notebook: everything the learner chose to keep — saved passages,
 * their own notes, and highlights — in one place, grouped by lesson.
 */

type Kind = 'saved' | 'note' | 'highlight';
type Filter = 'all' | Kind;

interface Entry {
  key: string;
  kind: Kind;
  topicId: string;
  topicTitle: string;
  text: string;
  title?: string;
  body?: string;
  color?: string;
  underline?: boolean;
  at: string;
  pinned?: boolean;
  raw: SavedItem | Note | Highlight;
}

const blockText = (b: Block | undefined, item: number): string => {
  if (!b) return '';
  if (b.t === 'list') return b.items[item] ?? '';
  if (b.t === 'example') return b.lines[item] ?? '';
  return b.text;
};

const clean = (s: string): string => prettyInline(s.replace(/\$/g, '').replace(/\*\*/g, '')).trim();

function topicIndex(docs: LeraDoc[]): Map<string, { title: string; blocks: Block[] }> {
  const map = new Map<string, { title: string; blocks: Block[] }>();
  for (const d of docs) for (const u of d.units) for (const t of u.topics) map.set(t.id, { title: t.title, blocks: t.blocks });
  return map;
}

const when = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const FILTERS: { id: Filter; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: 'book' },
  { id: 'saved', label: 'Saved', icon: 'bookmark' },
  { id: 'note', label: 'Notes', icon: 'note' },
  { id: 'highlight', label: 'Highlights', icon: 'underline' },
];

export function SavedScreen() {
  const docs = useStore((s) => s.docs);
  const saved = useStore((s) => s.saved);
  const notes = useStore((s) => s.notes);
  const highlights = useStore((s) => s.highlights);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const entries = useMemo<Entry[]>(() => {
    const topics = topicIndex(docs);
    const out: Entry[] = [];
    for (const s of saved) out.push({ key: `s:${s.id}`, kind: 'saved', topicId: s.topicId, topicTitle: topics.get(s.topicId)?.title ?? s.topicTitle, text: clean(s.text), at: s.createdAt, pinned: s.pinned, raw: s });
    for (const n of notes) out.push({ key: `n:${n.id}`, kind: 'note', topicId: n.topicId, topicTitle: topics.get(n.topicId)?.title ?? 'Lesson', text: clean(n.quote), title: n.title, body: n.content, at: n.createdAt, raw: n });
    for (const h of highlights) {
      const t = topics.get(h.topicId);
      const text = clean(blockText(t?.blocks[h.block], h.item).slice(h.start, h.end));
      if (!text) continue;
      out.push({ key: `h:${h.id}`, kind: 'highlight', topicId: h.topicId, topicTitle: t?.title ?? 'Lesson', text, color: h.color, underline: h.underline, at: '', raw: h });
    }
    return out;
  }, [docs, saved, notes, highlights]);

  const counts: Record<Filter, number> = { all: entries.length, saved: saved.length, note: notes.length, highlight: entries.filter((e) => e.kind === 'highlight').length };
  const q = query.trim().toLowerCase();
  const shown = entries.filter((e) => (filter === 'all' || e.kind === filter) && (!q || `${e.text} ${e.title ?? ''} ${e.body ?? ''} ${e.topicTitle}`.toLowerCase().includes(q)));
  const pinned = shown.filter((e) => e.pinned);
  const groups = new Map<string, { title: string; items: Entry[] }>();
  for (const e of shown.filter((x) => !x.pinned)) {
    const g = groups.get(e.topicId) ?? { title: e.topicTitle, items: [] };
    g.items.push(e);
    groups.set(e.topicId, g);
  }

  const remove = (e: Entry) => {
    haptic(6);
    if (e.kind === 'saved') actions.removeSaved((e.raw as SavedItem).id);
    else if (e.kind === 'note') actions.removeNote((e.raw as Note).id);
    else actions.removeHighlight((e.raw as Highlight).id);
    toast('Removed from your notebook');
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      toast('Copying isn’t allowed here.');
    }
  };

  const card = (e: Entry) => (
    <article key={e.key} className={`keep ${e.kind}`} style={e.kind === 'highlight' ? ({ '--hl': e.color } as CSSProperties) : undefined}>
      <button className="keep-main" onClick={() => go({ name: 'lesson', topicId: e.topicId })} aria-label={`Open in ${e.topicTitle}`}>
        {e.kind === 'saved' && (
          <>
            <span className="keep-quote" aria-hidden="true">“</span>
            <p className="keep-text">{e.text}</p>
          </>
        )}
        {e.kind === 'note' && (
          <>
            <b className="keep-title">{e.title || 'Untitled note'}</b>
            {e.body && <p className="keep-text">{e.body}</p>}
            {e.text && <p className="keep-source">on “{e.text.slice(0, 90)}{e.text.length > 90 ? '…' : ''}”</p>}
          </>
        )}
        {e.kind === 'highlight' && (
          <p className="keep-text">
            <mark className={e.underline ? 'under' : ''}>{e.text}</mark>
          </p>
        )}
      </button>
      <footer className="keep-foot">
        <span className="keep-kind">
          <Icon name={e.kind === 'saved' ? 'bookmark' : e.kind === 'note' ? 'note' : 'underline'} size={13} />
          {e.kind === 'saved' ? 'Saved' : e.kind === 'note' ? 'Note' : 'Highlight'}
          {e.at ? ` · ${when(e.at)}` : ''}
        </span>
        <span className="grow" />
        {e.kind === 'saved' && (
          <button className={`keep-act ${e.pinned ? 'on' : ''}`} onClick={() => { haptic(5); actions.togglePin((e.raw as SavedItem).id); }} aria-label={e.pinned ? 'Unpin' : 'Pin to top'} aria-pressed={!!e.pinned}>
            <Icon name="bookmark" size={16} fill={!!e.pinned} />
          </button>
        )}
        <button className="keep-act" onClick={() => void copy(e.kind === 'note' ? `${e.title ?? ''}\n${e.body ?? ''}`.trim() : e.text)} aria-label="Copy"><Icon name="copy" size={16} /></button>
        <button className="keep-act" onClick={() => remove(e)} aria-label="Remove"><Icon name="trash" size={16} /></button>
      </footer>
    </article>
  );

  return (
    <div className="screen saved-screen" data-dir="1">
      <header className="saved-head">
        <div className="row">
          <button className="iconbtn onbrand" onClick={back} aria-label="Back"><Icon name="back" /></button>
          <div className="grow">
            <h1>Notebook</h1>
            <p>{entries.length === 0 ? 'What you keep from your lessons' : `${entries.length} ${entries.length === 1 ? 'thing' : 'things'} kept from your lessons`}</p>
          </div>
          <span className="saved-mark"><Icon name="bookmark" size={26} fill /></span>
        </div>
        {entries.length > 0 && (
          <label className="saved-search">
            <Icon name="eye" size={17} />
            <input value={query} onChange={(e: { target: { value: string } }) => setQuery(e.target.value)} placeholder="Search your notebook" aria-label="Search your notebook" />
            {query && <button onClick={() => setQuery('')} aria-label="Clear search"><Icon name="close" size={16} /></button>}
          </label>
        )}
      </header>

      {entries.length > 0 && (
        <div className="saved-filters" role="tablist" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => { haptic(4); setFilter(f.id); }}>
              <Icon name={f.icon} size={15} /> {f.label} <i>{counts[f.id]}</i>
            </button>
          ))}
        </div>
      )}

      <div className="scroll">
        {entries.length === 0 ? (
          <div className="saved-empty stagger">
            <Lera size={96} mood="curious" />
            <h2>Nothing kept yet</h2>
            <p className="muted">Your notebook fills up as you read. Here’s how:</p>
            <ol className="howto">
              <li><span>1</span><div><b>Hold on any text</b> in a lesson to select it.</div></li>
              <li><span>2</span><div>Tap a <b>colour</b> to highlight, <b>Note</b> to write your own words, or <b>Save</b> to keep the passage.</div></li>
              <li><span>3</span><div>Find it here, grouped by lesson — one tap takes you back to where it came from.</div></li>
            </ol>
            <button className="linkbtn" onClick={() => go({ name: 'lessons' })}>Open my lessons <Icon name="chevron" size={15} /></button>
          </div>
        ) : shown.length === 0 ? (
          <div className="center" style={{ gap: 10, padding: '50px 30px' }}>
            <Lera size={76} mood="thinking" />
            <p className="muted">Nothing matches{q ? ` “${query.trim()}”` : ''} here.</p>
          </div>
        ) : (
          <div className="saved-list stagger">
            {pinned.length > 0 && (
              <section>
                <h3 className="saved-group"><Icon name="bookmark" size={14} fill /> Pinned</h3>
                <div className="col" style={{ gap: 10 }}>{pinned.map(card)}</div>
              </section>
            )}
            {[...groups.entries()].map(([topicId, g]) => (
              <section key={topicId}>
                <h3 className="saved-group">
                  <span className="grow">{g.title}</span>
                  <button onClick={() => go({ name: 'lesson', topicId })}>Open <Icon name="chevron" size={13} /></button>
                </h3>
                <div className="col" style={{ gap: 10 }}>{g.items.map(card)}</div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
