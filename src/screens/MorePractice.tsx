import { useState } from 'react';
import { aiPractice, PracticeLevel } from '../ai/tasks';
import { Problem } from '../engine/types';
import { msg, t } from '../i18n';
import { plain } from '../ingest/structure';
import { LeraDoc, Topic } from '../ingest/types';
import { actions, useStore } from '../store';
import { Icon } from '../ui/icons';
import { Button3D, Seg, haptic } from '../ui/kit';

const LEVELS: { id: PracticeLevel; label: string }[] = [
  { id: 'easier', label: msg('Easier') },
  { id: 'same', label: msg('Like my notes') },
  { id: 'harder', label: msg('Harder') },
];

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

/** A whole file, cut down to what each lesson is about. */
const fileNotes = (doc: LeraDoc): string =>
  doc.units.flatMap((u) => u.topics.map((tp) => `## ${tp.title}\n${lessonNotes(tp).slice(0, 420)}`)).join('\n\n');

/**
 * "Ask Lera to write problems": new practice for this lesson, made from the notes themselves.
 * The level and how many are chosen here; what comes back is kept with the lesson and handed to `onMade`.
 */
export function MorePractice({ topic, doc, onMade }: { topic: Topic; doc?: LeraDoc; onMade: (problems: Problem[]) => void }) {
  const ai = useStore((s) => s.ai);
  const [level, setLevel] = useState<PracticeLevel>('same');
  const [count, setCount] = useState<'3' | '5' | '8'>('5');
  const [scope, setScope] = useState<'section' | 'file'>('section');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ai.provider === 'none') {
    return <p className="faint" style={{ fontSize: 13.5, lineHeight: 1.45 }}>{t('Lera’s AI is not connected in this build, so she cannot write new problems yet.')}</p>;
  }

  const make = async () => {
    haptic(6);
    setBusy(true);
    setError(null);
    try {
      const whole = scope === 'file' && doc;
      const made = await aiPractice(ai, { topicId: topic.id, title: whole ? doc.title : topic.title, notes: whole ? fileNotes(doc) : lessonNotes(topic), level, count: Number(count) });
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

  return (
    <section className="card more-practice">
      <span className="label">{t('Ask Lera to write problems')}</span>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.45 }}>{t('New problems made from these notes. They are kept with the lesson and checked like the rest.')}</p>
      <Seg options={LEVELS.map((l) => ({ id: l.id, label: t(l.label) }))} value={level} onChange={setLevel} />
      <Seg options={[{ id: '3', label: '3' }, { id: '5', label: '5' }, { id: '8', label: '8' }]} value={count} onChange={setCount} />
      {doc && doc.units.some((u) => u.topics.length > 1) && (
        <Seg options={[{ id: 'section', label: t('This section') }, { id: 'file', label: t('Whole file') }]} value={scope} onChange={setScope} />
      )}
      {error && <p className="auth-note bad" role="alert">{error}</p>}
      <div className="center">
        <Button3D small disabled={busy} onClick={make}>
          <Icon name="sparkle" size={16} /> {busy ? t('Writing problems…') : t('Write problems')}
        </Button3D>
      </div>
    </section>
  );
}
