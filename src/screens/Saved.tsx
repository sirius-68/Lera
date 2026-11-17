import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { prettyInline } from '../ingest/text';
import { Block, LeraDoc } from '../ingest/types';
import { Lera } from '../mascot/Lera';
import { actions, useStore } from '../store';
import { back, go, openOverlay } from '../store/nav';
import { Highlight, Note, SavedItem } from '../store/types';
import { Icon } from '../ui/icons';
import { haptic, toast } from '../ui/kit';
import { t as tr, tn } from '../i18n';

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
  // a formula on its own line is highlighted whole
  if (b.t === 'math') return `$${b.text}$`;
  if (b.t === 'table') return b.rows.map((r) => r.join(' | ')).join('\n');
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
  if (days <= 0) return tr('Today');
  if (days === 1) return tr('Yesterday');
  if (days < 7) return tn(days, '{n} day ago', '{n} days ago');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

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
    for (const n of notes) out.push({ key: `n:${n.id}`, kind: 'note', topicId: n.topicId, topicTitle: topics.get(n.topicId)?.title ?? tr('Lesson'), text: clean(n.quote), title: n.title, body: n.content, at: n.createdAt, raw: n });
    for (const h of highlights) {
      const t = topics.get(h.topicId);
      const text = clean(blockText(t?.blocks[h.block], h.item).slice(h.start, h.end));
      if (!text) continue;
      out.push({ key: `h:${h.id}`, kind: 'highlight', topicId: h.topicId, topicTitle: t?.title ?? tr('Lesson'), text, color: h.color, underline: h.underline, at: '', raw: h });
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
    toast(tr('Removed from your notebook'));
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(tr('Copied'));
    } catch {
      toast(tr('Copying isn’t allowed here.'));
    }
  };

  const open = (e: { topicId: string }) => (e.topicId === 'chat' ? openOverlay({ name: 'ask' }) : go({ name: 'lesson', topicId: e.topicId }));

  const card = (e: Entry) => (
    <article key={e.key} className={`nb-card ${e.kind}`} style={e.kind === 'highlight' ? ({ '--hl': e.color } as CSSProperties) : undefined}>
      <span className="nb-ic" aria-hidden="true">
        <Icon name={e.kind === 'saved' ? 'bookmark' : e.kind === 'note' ? 'note' : 'underline'} size={18} fill={e.kind === 'saved'} />
      </span>
      <div className="nb-body">
        <button className="nb-main" onClick={() => open(e)} aria-label={tr('Open in {0}', { 0: e.topicTitle })}>
          {e.kind === 'saved' && <p className="nb-text">{e.text}</p>}
          {e.kind === 'note' && (
            <>
              <b className="nb-title">{e.title || tr('Untitled note')}</b>
              {e.body && <p className="nb-text">{e.body}</p>}
              {e.text && <p className="nb-source">“{e.text.slice(0, 90)}{e.text.length > 90 ? '…' : ''}”</p>}
            </>
          )}
          {e.kind === 'highlight' && (
            <p className="nb-text">
              <mark className={e.underline ? 'under' : ''}>{e.text}</mark>
            </p>
          )}
        </button>
        <footer className="nb-foot">
          <span className="nb-kind">
            {e.kind === 'saved' ? tr('Saved') : e.kind === 'note' ? tr('Your note') : tr('Highlight')}
            {e.at ? ` · ${when(e.at)}` : ''}
          </span>
          <span className="grow" />
          {e.kind === 'saved' && (
            <button className={`nb-act ${e.pinned ? 'on' : ''}`} onClick={() => { haptic(5); actions.togglePin((e.raw as SavedItem).id); }} aria-label={e.pinned ? tr('Unpin') : tr('Pin to top')} aria-pressed={!!e.pinned}>
              <Icon name="target" size={16} />
            </button>
          )}
          <button className="nb-act" onClick={() => void copy(e.kind === 'note' ? `${e.title ?? ''}\n${e.body ?? ''}`.trim() : e.text)} aria-label={tr('Copy')}><Icon name="copy" size={16} /></button>
          <button className="nb-act" onClick={() => remove(e)} aria-label={tr('Remove')}><Icon name="trash" size={16} /></button>
        </footer>
      </div>
    </article>
  );

  const STATS: { id: Kind; label: string; icon: string }[] = [
    { id: 'saved', label: tr('Saved'), icon: 'bookmark' },
    { id: 'note', label: tr('Notes'), icon: 'note' },
    { id: 'highlight', label: tr('Highlights'), icon: 'underline' },
  ];

  return (
    <div className="screen" data-dir="1">
      <div className="topbar">
        <button className="iconbtn" onClick={back} aria-label={tr('Back')}><Icon name="back" /></button>
        <h1>{tr('Notebook')}</h1>
      </div>
      <div className="scroll">
        <div className="stagger" style={{ padding: '4px 18px 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className="nb-hero">
            <div className="row" style={{ gap: 14 }}>
              <span className="nb-count">{entries.length}</span>
              <div className="grow">
                <b>{entries.length === 1 ? 'thing kept' : tr('things kept')}</b>
                <span>{tr('from your lessons and chats')}</span>
              </div>
              <span className="nb-badge"><Icon name="bookmark" size={24} fill /></span>
            </div>
            <div className="nb-stats" role="tablist" aria-label={tr('Show')}>
              {STATS.map((f) => (
                <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => { haptic(4); setFilter(filter === f.id ? 'all' : f.id); }}>
                  <Icon name={f.icon} size={16} />
                  <b>{counts[f.id]}</b>
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
          </section>

          {entries.length > 0 && (
            <label className="nb-search">
              <Icon name="eye" size={18} />
              <input value={query} onChange={(e: { target: { value: string } }) => setQuery(e.target.value)} placeholder={tr('Search your notebook')} aria-label={tr('Search your notebook')} />
              {query && <button onClick={() => setQuery('')} aria-label={tr('Clear search')}><Icon name="close" size={16} /></button>}
            </label>
          )}

          {entries.length === 0 ? (
            <div className="saved-empty">
              <Lera size={92} mood="curious" />
              <h2>{tr('Nothing kept yet')}</h2>
              <p className="muted">{tr('Your notebook fills up as you read. Here’s how:')}</p>
              <ol className="howto">
                <li><span>1</span><div><b>{tr('Hold on any text')}</b> in a lesson to select it.</div></li>
                <li><span>2</span><div>{tr('Tap a')}{' '}<b>colour</b> to highlight, <b>{tr('Note')}</b> to write your own words, or <b>{tr('Save')}</b> to keep the passage.</div></li>
                <li><span>3</span><div>{tr('Answers from')}{' '}<b>{tr('Ask Lera')}</b>{' '}{tr('can be saved too, tap a message.')}</div></li>
              </ol>
              <button className="linkbtn" onClick={() => go({ name: 'lessons' })}>{tr('Open my lessons')}{' '}<Icon name="chevron" size={15} /></button>
            </div>
          ) : shown.length === 0 ? (
            <div className="center" style={{ gap: 10, padding: '36px 30px' }}>
              <Lera size={76} mood="thinking" />
              <p className="muted">{tr('Nothing matches')}{q ? ` “${query.trim()}”` : ''} here.</p>
              {filter !== 'all' && <button className="linkbtn" onClick={() => setFilter('all')}>{tr('Show everything')}</button>}
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <section className="col" style={{ gap: 10 }}>
                  <span className="label">{tr('Pinned')}</span>
                  {pinned.map(card)}
                </section>
              )}
              {[...groups.entries()].map(([topicId, g]) => (
                <section key={topicId} className="col" style={{ gap: 10 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="label">{g.title}</span>
                    <button className="linkbtn" style={{ padding: '2px 4px', fontSize: 13.5 }} onClick={() => open({ topicId })}>{tr('Open')}{' '}<Icon name="chevron" size={13} /></button>
                  </div>
                  {g.items.map(card)}
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
