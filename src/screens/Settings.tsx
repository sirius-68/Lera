import { SUBJECT_LABEL } from '../engine/concepts-calc';
import { Subject } from '../engine/types';
import { actions, getState, useStore } from '../store';
import { GOALS } from '../store/game';
import { back, resetNav } from '../store/nav';
import { Button3D, confirmDialog, haptic, toast } from '../ui/kit';
import { Icon } from '../ui/icons';

const SUBJECTS: Subject[] = ['algebra', 'calc1', 'calc2'];

export function SettingsScreen() {
  const profile = useStore((s) => s.profile);
  const subjects = profile.subjects?.length ? profile.subjects : (['algebra'] as Subject[]);

  const exportData = async () => {
    const { ai: _omit, ...rest } = getState();
    void _omit;
    const json = JSON.stringify(rest, null, 2);
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = `lera-progress-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      try {
        await navigator.clipboard.writeText(json);
        toast('Progress copied — paste it into a file to keep it.');
      } catch {
        toast('Export isn’t available here.');
      }
    }
  };

  return (
    <div className="screen" data-dir="1">
      <div className="topbar">
        <button className="iconbtn" onClick={back} aria-label="Back"><Icon name="back" /></button>
        <h1>Settings</h1>
      </div>
      <div className="scroll">
        <div className="stagger" style={{ padding: '4px 20px 30px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <section className="col" style={{ gap: 8 }}>
            <span className="label">You</span>
            <input className="field" value={profile.name} placeholder="First name" onChange={(e: { target: { value: string } }) => actions.setProfile({ name: e.target.value })} aria-label="First name" />
          </section>

          <section className="col" style={{ gap: 8 }}>
            <span className="label">What you’re studying</span>
            <div className="chips-row">
              {SUBJECTS.map((s) => {
                const on = subjects.includes(s);
                return (
                  <button
                    key={s}
                    className={`chip-toggle ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      haptic(5);
                      const next = on ? subjects.filter((x) => x !== s) : [...subjects, s];
                      if (next.length) actions.setProfile({ subjects: next });
                    }}
                  >
                    {on && <Icon name="check" size={14} stroke={3} />} {SUBJECT_LABEL[s]}
                  </button>
                );
              })}
            </div>
            <p className="faint" style={{ fontSize: 13 }}>Decides which ideas are offered under Practice. Your notes are always read in full.</p>
          </section>

          <section className="col" style={{ gap: 8 }}>
            <span className="label">Checking your working</span>
            {(
              [
                ['line', 'As I go', 'Each line is marked the moment you write it.'],
                ['end', 'When I finish', 'Write the whole solution, then have every line marked at once.'],
              ] as ['line' | 'end', string, string][]
            ).map(([id, title, sub]) => (
              <button key={id} className={`option ${profile.checkMode === id ? 'on' : ''}`} onClick={() => { haptic(5); actions.setProfile({ checkMode: id }); }}>
                <span className="grow" style={{ textAlign: 'left' }}><b>{title}</b><span className="sub">{sub}</span></span>
                <span className="radio" />
              </button>
            ))}
            <p className="faint" style={{ fontSize: 13 }}>You can also switch inside any problem.</p>
          </section>

          <section className="col" style={{ gap: 8 }}>
            <span className="label">Daily goal</span>
            <div className="goal-grid">
              {GOALS.map((g) => (
                <button key={g.xp} className={profile.dailyXp === g.xp ? 'on' : ''} onClick={() => { haptic(5); actions.setProfile({ dailyXp: g.xp, focusMinutes: g.xp <= 15 ? 5 : g.xp <= 30 ? 10 : g.xp <= 50 ? 15 : 20 }); }}>
                  <b>{g.label}</b>
                  <span>{g.xp} XP</span>
                </button>
              ))}
            </div>
          </section>

          <section className="col" style={{ gap: 8 }}>
            <span className="label">About</span>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
              Lera checks algebra and calculus on this device with its own engine. Your notes, working and progress stay here — there is no account behind the app.
            </p>
          </section>

          <section className="col" style={{ gap: 8 }}>
            <span className="label">Your data</span>
            <Button3D small variant="secondary" onClick={exportData} style={{ alignSelf: 'flex-start' }}><Icon name="share" size={16} /> Export progress</Button3D>
            <button
              className="linkbtn"
              style={{ color: 'var(--gap)', alignSelf: 'flex-start', paddingLeft: 0 }}
              onClick={async () => {
                if (await confirmDialog('Erase everything?', { body: 'All notes, progress and settings on this device will be removed.', yes: 'Erase', danger: true })) {
                  actions.reset();
                  resetNav();
                }
              }}
            >
              <Icon name="trash" size={16} /> Erase everything and start again
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
