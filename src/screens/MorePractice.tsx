import { useEffect, useRef, useState } from 'react';
import { aiPractice } from '../ai/tasks';
import { Problem } from '../engine/types';
import { t } from '../i18n';
import { Lera } from '../mascot/Lera';
import { plain } from '../ingest/structure';
import { Topic } from '../ingest/types';
import { actions, getState, useStore } from '../store';
import { Icon } from '../ui/icons';
import { Button3D, haptic } from '../ui/kit';

/** The words of one lesson, for the model to write problems from. */
function lessonNotes(topic: Topic): string {
  const out: string[] = [];
  for (const b of topic.blocks) {
    if (b.t === 'p' || b.t === 'h' || b.t === 'note' || b.t === 'math') out.push(plain(b.text));
    else if (b.t === 'list') out.push(...b.items.map(plain));
    else if (b.t === 'example') out.push(`${b.title}: ${b.lines.map(plain).join(' ; ')}`);
    else if (b.t === 'table') out.push(b.rows.map((r) => r.map(plain).join(' | ')).join('\n'));
  }
  for (const e of topic.exercises.filter((x) => !x.made)) out.push(`Exercise: ${e.original ?? `${e.prompt} ${e.given}`}`);
  return out.join('\n');
}

/** Asks Lera's AI for problems on a lesson and keeps what comes back with that lesson. */
function useWriter(topic: Topic, onMade: (problems: Problem[]) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const write = async (wish?: string) => {
    setBusy(true);
    setError(null);
    try {
      const made = await aiPractice(getState().ai, { topicId: topic.id, title: topic.title, notes: lessonNotes(topic), wish });
      if (!made.length) setError(t('Nothing usable came back. Try again.'));
      else {
        actions.addExercises(topic.id, made);
        onMade(made);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Nothing usable came back. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, write };
}

/**
 * A lesson whose part of the file has no exercises: Lera writes the practice from the notes, straight away,
 * with nothing to set up. Shown while she does, and if it did not work.
 */
export function WritePractice({ topic, onMade }: { topic: Topic; onMade: (problems: Problem[]) => void }) {
  const aiOn = useStore((s) => s.ai.provider !== 'none');
  const { busy, error, write } = useWriter(topic, onMade);
  const started = useRef(false);
  useEffect(() => {
    if (!aiOn || started.current) return;
    started.current = true;
    void write();
    // once, when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOn]);

  return (
    <div className="center" style={{ gap: 12, padding: '10px 10px 18px' }}>
      <Lera size={96} mood={busy ? 'writing' : error ? 'confused' : 'reading'} />
      <h2 style={{ fontSize: 21, textAlign: 'center' }}>{busy ? t('Writing practice from your notes…') : t('No exercises in this part of your notes')}</h2>
      <p className="muted" style={{ lineHeight: 1.5, textAlign: 'center' }}>
        {busy
          ? t('This section has no exercises of its own, so I am making some from what it teaches.')
          : !aiOn
            ? t('Lera’s AI is not connected in this build, so she cannot write practice for it yet.')
            : error ?? ''}
      </p>
      {aiOn && !busy && error && <Button3D small onClick={() => { haptic(6); void write(); }}>{t('Try again')}</Button3D>}
    </div>
  );
}

/** "Ask Lera for more practice": one box, in the learner's own words. No settings. */
export function MorePractice({ topic, onMade }: { topic: Topic; onMade: (problems: Problem[]) => void }) {
  const aiOn = useStore((s) => s.ai.provider !== 'none');
  const { busy, error, write } = useWriter(topic, onMade);
  const [wish, setWish] = useState('');
  if (!aiOn) return null;
  const send = () => {
    if (busy) return;
    haptic(6);
    void write(wish.trim() || undefined);
  };
  return (
    <section className="card more-practice">
      <span className="label">{t('Ask Lera for more practice')}</span>
      <div className="wish">
        <input
          value={wish}
          onChange={(e: { target: { value: string } }) => setWish(e.target.value)}
          onKeyDown={(e: { key: string }) => e.key === 'Enter' && send()}
          placeholder={t('What would you like? e.g. harder ones, or more like example 2')}
          aria-label={t('What would you like to practise?')}
          disabled={busy}
        />
        <button className="wish-go" onClick={send} disabled={busy} aria-label={t('Write problems')}><Icon name={busy ? 'refresh' : 'arrow'} size={18} /></button>
      </div>
      <p className={`faint ${error ? 'bad' : ''}`} style={{ fontSize: 13, lineHeight: 1.4 }} role={error ? 'alert' : undefined}>
        {error ?? (busy ? t('Writing problems…') : t('Leave it empty for five more like the ones in your notes.'))}
      </p>
    </section>
  );
}
