import { Lera, Mood } from '../../mascot/Lera';
import { Icon } from '../../ui/icons';

/**
 * Small moving pictures for the onboarding: one for each answer tile, and
 * the phone that shows the home-screen widget changing through a day.
 */

/** The drawing on an answer tile. Each one keeps moving; the chosen one moves more. */
export function TileArt({ id }: { id: string }) {
  switch (id) {
    case 'morning':
      return (
        <svg className="ta ta-morning" viewBox="0 0 64 64" aria-hidden="true">
          <g className="rays">{[0, 45, 90, 135, 180].map((r) => <path key={r} d="M32 12v6" transform={`rotate(${r - 90} 32 40)`} />)}</g>
          <circle className="sun" cx="32" cy="40" r="12" />
          <path className="hill a" d="M0 64V48q14-12 30 0t34-4v20z" />
          <path className="hill b" d="M0 64V54q18-9 34 0t30-2v12z" />
        </svg>
      );
    case 'afternoon':
      return (
        <svg className="ta ta-noon" viewBox="0 0 64 64" aria-hidden="true">
          <g className="rays">{[0, 45, 90, 135, 180, 225, 270, 315].map((r) => <path key={r} d="M32 6v7" transform={`rotate(${r} 32 30)`} />)}</g>
          <circle className="sun" cx="32" cy="30" r="13" />
          <path className="cloud" d="M14 52a7 7 0 0 1 3-13.3 9 9 0 0 1 17-1.7 7.5 7.5 0 0 1 4 15z" />
        </svg>
      );
    case 'evening':
      return (
        <svg className="ta ta-evening" viewBox="0 0 64 64" aria-hidden="true">
          <circle className="sun" cx="32" cy="38" r="15" />
          <path className="town" d="M0 64V44h9v-8h9v12h7V32h10v16h8V40h9v8h12v16z" />
          <g className="lights"><rect x="12" y="41" width="3" height="3" /><rect x="29" y="37" width="3" height="3" /><rect x="29" y="45" width="3" height="3" /><rect x="46" y="45" width="3" height="3" /></g>
        </svg>
      );
    case 'night':
      return (
        <svg className="ta ta-night" viewBox="0 0 64 64" aria-hidden="true">
          <path className="moon" d="M40 8a22 22 0 1 0 16 36A18 18 0 0 1 40 8z" />
          <g className="stars"><path d="M14 10l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" /><path d="M52 46l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" /><circle cx="50" cy="16" r="1.6" /></g>
          <text className="zz" x="26" y="34">x²</text>
        </svg>
      );
    case 'school':
      return (
        <svg className="ta ta-school" viewBox="0 0 64 64" aria-hidden="true">
          <path className="strap" d="M24 18a8 8 0 0 1 16 0" />
          <rect className="bag" x="14" y="18" width="36" height="38" rx="10" />
          <rect className="pocket" x="21" y="36" width="22" height="14" rx="5" />
          <path className="pen" d="M44 6l5 2-6 15-4 2 .2-4.4z" />
        </svg>
      );
    case 'uni':
      return (
        <svg className="ta ta-uni" viewBox="0 0 64 64" aria-hidden="true">
          <path className="band" d="M17 30v12q15 9 30 0V30z" />
          <path className="board" d="M32 12l28 12-28 12L4 24z" />
          <g className="tassel"><path d="M32 24l22 3v16" /><circle cx="54" cy="46" r="3" /></g>
        </svg>
      );
    case 'self':
      return (
        <svg className="ta ta-self" viewBox="0 0 64 64" aria-hidden="true">
          <rect className="bk c" x="10" y="44" width="44" height="11" rx="3" />
          <rect className="bk b" x="14" y="32" width="38" height="11" rx="3" />
          <rect className="bk a" x="12" y="20" width="36" height="11" rx="3" />
          <path className="spark" d="M50 6l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" />
        </svg>
      );
    default:
      // 'back': a loop that comes round again
      return (
        <svg className="ta ta-back" viewBox="0 0 64 64" aria-hidden="true">
          <g className="loop"><path d="M12 32a20 20 0 0 1 35-13" /><path d="M52 32a20 20 0 0 1-35 13" /><path className="head" d="M49 8v12H37" /><path className="head" d="M15 56V44h12" /></g>
          <text x="32" y="38">π</text>
        </svg>
      );
  }
}

const DAY: { mood: Mood; tone: string; line: string; n: string }[] = [
  { mood: 'happy', tone: 'purple', line: 'Time to practise!', n: '6' },
  { mood: 'pleading', tone: 'violet', line: 'Got 3 minutes?', n: '6' },
  { mood: 'scared', tone: 'orange', line: 'Save your streak!', n: '6' },
  { mood: 'strong', tone: 'green', line: 'Streak safe!', n: '7' },
];

/** A phone whose widget runs through a day: calm, asking, alarmed, pleased. */
export function SceneWidget() {
  return (
    <div className="sc sc-widget" aria-hidden="true">
      <div className="phone">
        <div className="wg-stack">
          {DAY.map((d, i) => (
            <div key={i} className={`wg wg-${d.tone}`} style={{ animationDelay: `${i * 2.2}s` }}>
              <b><Icon name="flame" size={19} fill /> {d.n}</b>
              <span>{d.line}</span>
              <i><Lera size={70} mood={d.mood} interactive={false} /></i>
            </div>
          ))}
        </div>
        <div className="apps">{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</div>
      </div>
    </div>
  );
}
