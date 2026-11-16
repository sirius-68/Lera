import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import sampleUrl from '../../samples/algebra-essentials.docx';
import uploadImg from '../assets/illustrations/upload.jpg';
import { aiReady } from '../ai/providers';
import { aiTranslate } from '../ai/tasks';
import { getLang, Lang, langName, t } from '../i18n';
import { detectLang } from '../i18n/detect';
import { ingestBytes } from '../ingest';
import { IngestProgress, LeraDoc } from '../ingest/types';
import { Lera } from '../mascot/Lera';
import { actions, getState } from '../store';
import { back, replace } from '../store/nav';
import { Bar, Button3D, haptic } from '../ui/kit';
import { Icon } from '../ui/icons';

const STAGES: { id: IngestProgress['stage']; label: string }[] = [
  { id: 'reading', label: 'Reading your file' },
  { id: 'structuring', label: 'Finding topics and headings' },
  { id: 'exercises', label: 'Pulling out the exercises' },
  { id: 'path', label: 'Building your learning path' },
];

const ORDER = ['reading', 'structuring', 'exercises', 'path', 'done'];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Source {
  name: string;
  bytes: () => Promise<Uint8Array>;
}

export const sampleSource: Source = {
  name: 'Algebra essentials (sample).docx',
  bytes: async () => {
    // in the single-file build the sample is inlined as a data URL; decode it without a network request
    const m = /^data:[^,]*;base64,(.*)$/.exec(sampleUrl);
    if (m) return Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
    return new Uint8Array(await (await fetch(sampleUrl)).arrayBuffer());
  },
};

export const fileSource = (file: File): Source => ({ name: file.name, bytes: async () => new Uint8Array(await file.arrayBuffer()) });

/** Choose a PDF or Word file (or drop one). */
export function UploadPicker({ onPick, onSkip, compact }: { onPick: (s: Source) => void; onSkip?: () => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPick(fileSource(f));
    e.target.value = '';
  };
  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onPick(fileSource(f));
  };
  return (
    <div className="center stagger" style={{ gap: 14, padding: '0 24px' }}>
      {!compact && <img src={uploadImg} alt="" style={{ width: 210, height: 210, objectFit: 'contain', mixBlendMode: 'multiply' }} />}
      <h2 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>Upload your notes</h2>
      <p className="muted" style={{ fontSize: 15.5, lineHeight: 1.5, maxWidth: 300 }}>
        A PDF or Word file with your algebra or calculus notes. Lera turns it into lessons, rebuilds its graphs and puts every exercise it finds under Practice.
      </p>
      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e: { key: string }) => e.key === 'Enter' && input.current?.click()}
      >
        <span className="drop-ic">
          <Icon name="upload" size={24} />
        </span>
        <b>Choose a file</b>
        <span className="faint" style={{ fontSize: 13 }}>
          PDF, DOCX, TXT or Markdown · stays on this device
        </span>
        <input ref={input} type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden onChange={choose} />
      </div>
      <Button3D variant="secondary" onClick={() => onPick(sampleSource)}>
        <Icon name="sparkle" size={18} /> Try the sample algebra notes
      </Button3D>
      {onSkip && (
        <button className="linkbtn" onClick={onSkip}>
          Skip for now
        </button>
      )}
    </div>
  );
}

/** Reads the file for real and shows each stage as it completes. */
export function Processing({ source, onDone, onCancel }: { source: Source; onDone: (doc: LeraDoc) => void; onCancel: () => void }) {
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0.03);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<LeraDoc | null>(null);
  // a file in another language: the person is asked before anything is translated
  const [ask, setAsk] = useState<{ from: Lang | 'other'; answer: (yes: boolean) => void } | null>(null);
  const [translating, setTranslating] = useState<number | null>(null);
  const nameOf = (l: Lang | 'other'): string => (l === 'other' ? t('another language') : t(langName(l)));

  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();
    let reached = 0;
    let note: string | null = null;
    (async () => {
      try {
        const bytes = await source.bytes();
        const work = ingestBytes(bytes, source.name, {
          ai: getState().ai,
          signal: ctl.signal,
          translate: async (paras) => {
            const from = detectLang(paras.filter((x) => !x.math).map((x) => x.text).join(' '));
            const to = getLang();
            if (from === to || !alive) return null;
            const yes = await new Promise<boolean>((answer) => setAsk({ from, answer }));
            if (!alive) return null;
            setAsk(null);
            if (!yes) return null;
            const ai = getState().ai;
            if (!aiReady(ai)) {
              note = t('Translation needs the AI service, which is not connected in this build. The file was kept in {from}.', { from: nameOf(from) });
              return null;
            }
            setTranslating(0);
            // lines that are only a formula are not sent: there is nothing in them to translate, and nothing to get wrong
            const words = paras.map((x, i) => ({ x, i })).filter(({ x }) => !x.math);
            const texts = await aiTranslate(ai, words.map(({ x }) => x.text), langName(to), (f) => alive && setTranslating(f), ctl.signal);
            if (alive) setTranslating(null);
            const out = [...paras];
            words.forEach(({ x, i }, k) => (out[i] = { ...x, text: texts[k] ?? x.text }));
            return out;
          },
          onProgress: (p) => {
            reached = Math.max(reached, ORDER.indexOf(p.stage));
            if (alive) setProgress((old) => Math.max(old, p.progress * 0.9));
          },
        });
        // the built-in reader is quick; let each stage be seen before it ticks off
        const result = await work;
        if (note) result.warnings.unshift(note);
        for (let i = 0; i < STAGES.length; i++) {
          if (!alive) return;
          setStage(i);
          setProgress((old) => Math.max(old, (i + 1) / (STAGES.length + 0.4)));
          await wait(520);
        }
        if (!alive) return;
        setStage(STAGES.length);
        setProgress(1);
        haptic([10, 40, 14]);
        setDoc(result);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Something went wrong while reading this file.');
      }
    })();
    return () => {
      alive = false;
      ctl.abort();
    };
  }, [source]);

  if (ask) {
    const from = nameOf(ask.from);
    const to = t(langName(getLang()));
    return (
      <div className="center stagger" style={{ gap: 14, padding: '0 26px' }}>
        <Lera size={96} mood="curious" />
        <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25 }}>{t('Translate it to {to} first?', { to })}</h2>
        <p className="muted" style={{ lineHeight: 1.5 }}>{t('This file is in {from}. Your app is in {to}.', { from, to })}</p>
        <p className="muted" style={{ lineHeight: 1.5, fontSize: 14 }}>{t('Lera translates the words and keeps every formula, number and exercise exactly as written.')}</p>
        <Button3D onClick={() => ask.answer(true)}>{t('Translate to {to}', { to })}</Button3D>
        <Button3D variant="secondary" onClick={() => ask.answer(false)}>{t('Keep it in {from}', { from })}</Button3D>
      </div>
    );
  }

  if (translating !== null) {
    return (
      <div className="center" style={{ gap: 18, padding: '0 28px' }}>
        <Lera size={96} mood="reading" />
        <h2 style={{ fontSize: 21, fontWeight: 700 }}>{t('Translating…')}</h2>
        <div style={{ alignSelf: 'stretch' }}><Bar value={Math.max(0.04, translating)} label={t('Translating…')} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="center stagger" style={{ gap: 16, padding: '0 28px' }}>
        <Lera size={96} mood="oops" />
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>I couldn’t read that one</h2>
        <p className="muted" style={{ lineHeight: 1.5 }}>{error}</p>
        <Button3D onClick={onCancel}>Choose another file</Button3D>
      </div>
    );
  }

  if (doc) {
    const topics = doc.units.reduce((n, u) => n + u.topics.length, 0);
    const exercises = doc.units.reduce((n, u) => n + u.topics.reduce((m, t) => m + t.exercises.length, 0), 0);
    return (
      <div className="center stagger" style={{ gap: 14, padding: '0 24px' }}>
        <Lera size={110} mood="celebrate" />
        <h2 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>Your notes are ready</h2>
        <p className="muted" style={{ fontSize: 15.5 }}>{doc.title}</p>
        <div className="row" style={{ gap: 10, alignSelf: 'stretch', justifyContent: 'center' }}>
          {[
            [doc.units.length, doc.units.length === 1 ? 'unit' : 'units'],
            [topics, topics === 1 ? 'lesson' : 'lessons'],
            [exercises, exercises === 1 ? 'exercise' : 'exercises'],
          ].map(([n, label], i) => (
            <div key={label} className="stat" style={{ animationDelay: `${200 + i * 110}ms` }}>
              <b>{n}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
        {(doc.tocVia === 'outline' || doc.tocVia === 'contents') && (
          <p className="found">
            <Icon name="check" size={16} stroke={3} />
            <span>
              Chapters and sections taken from {doc.tocVia === 'outline' ? 'the file’s own table of contents' : 'the printed contents page'}
              {doc.skippedPages ? ` · ${doc.skippedPages} ${doc.skippedPages === 1 ? 'page' : 'pages'} of cover and front matter left out` : ''}.
            </span>
          </p>
        )}
        {doc.warnings.map((w) => (
          <p key={w} className="warn">
            <Icon name="alert" size={17} /> <span>{w}</span>
          </p>
        ))}
        {exercises === 0 && doc.warnings.length === 0 && (
          <p className="warn">
            <Icon name="alert" size={17} /> <span>I didn’t find exercises in this file, so Practice will use problems written for each topic.</span>
          </p>
        )}
        <Button3D sheen onClick={() => onDone(doc)}>
          Start at the beginning <Icon name="arrow" size={18} />
        </Button3D>
        {doc.units[0]?.topics[0] && <span className="faint" style={{ fontSize: 13, textAlign: 'center' }}>{doc.units[0].title} · {doc.units[0].topics[0].title}</span>}
      </div>
    );
  }

  return (
    <div className="center" style={{ gap: 18, padding: '0 28px' }}>
      <Lera size={104} mood="thinking" interactive={false} />
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Reading your notes…</h2>
        <p className="faint" style={{ fontSize: 13.5, marginTop: 4, wordBreak: 'break-word' }}>{source.name}</p>
      </div>
      <div style={{ alignSelf: 'stretch' }}>
        <Bar value={progress} label="Reading progress" />
      </div>
      <ul className="stages">
        {STAGES.map((s, i) => (
          <li key={s.id} data-state={i < stage ? 'done' : i === stage ? 'now' : 'todo'}>
            <span className="tick">{i < stage ? <Icon name="check" size={14} stroke={3} /> : null}</span>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Adding more notes from inside the app. */
export function UploadScreen() {
  const [source, setSource] = useState<Source | null>(null);
  return (
    <div className="screen" data-dir="1">
      <div className="topbar">
        <button className="iconbtn" onClick={back} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1>Add notes</h1>
      </div>
      <div className="scroll" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 30 }}>
        {source ? (
          <Processing
            source={source}
            onCancel={() => setSource(null)}
            onDone={(doc) => {
              actions.addDoc(doc);
              // a new book opens on its first chapter's first lesson
              const first = doc.units[0]?.topics[0];
              replace(first ? { name: 'lesson', topicId: first.id } : { name: 'lessons' });
            }}
          />
        ) : (
          <UploadPicker onPick={setSource} />
        )}
      </div>
    </div>
  );
}
