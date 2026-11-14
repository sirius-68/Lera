import { Lera } from '../../mascot/Lera';
import { Icon } from '../../ui/icons';
import { MathView } from '../../ui/math';

/**
 * Motion graphics for the first run. Each scene is a short loop that shows —
 * rather than says — one thing Lera does. They are plain HTML and SVG moved
 * by CSS keyframes (see styles/onb.css), so they cost nothing to download and
 * stay sharp on any screen.
 */

/** Every line is read; the one that breaks a rule is flagged, explained and put right. */
export function SceneLines() {
  return (
    <div className="sc sc-lines" aria-hidden="true">
      <div className="sc-card">
        <span className="sc-label">Solve for x</span>
        <div className="sc-given"><MathView text="3x + 4 = 19" /></div>
        <div className="sc-row r1">
          <span className="n">1</span>
          <span className="swap">
            <span className="wrong"><MathView text="3x = 19 + 4" /></span>
            <span className="right"><MathView text="3x = 19 - 4" /></span>
          </span>
          <i className="flag" />
          <i className="tick"><Icon name="check" size={13} stroke={3.4} /></i>
        </div>
        <div className="sc-row r2">
          <span className="n">2</span>
          <MathView text="3x = 15" />
          <i className="tick"><Icon name="check" size={13} stroke={3.4} /></i>
        </div>
        <div className="sc-row r3">
          <span className="n">3</span>
          <MathView text="x = 5" />
          <i className="tick"><Icon name="check" size={13} stroke={3.4} /></i>
        </div>
        <i className="sc-scan" />
      </div>
      <div className="sc-tip">
        <b>Line 1</b> The + 4 crossed over but kept its sign.
      </div>
    </div>
  );
}

/** A file's headings turn into stops on a path. */
export function ScenePath() {
  return (
    <div className="sc sc-path" aria-hidden="true">
      <svg viewBox="0 0 300 220" width="100%" height="100%">
        <g className="sheet">
          <rect x="22" y="44" width="92" height="124" rx="14" fill="#fff" stroke="#d9d6ff" strokeWidth="2.5" />
          <rect x="22" y="44" width="92" height="26" rx="12" fill="#6c63ff" />
          <text x="68" y="62" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">notes.pdf</text>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} className={`ln l${i}`} x="34" y={84 + i * 20} width={i % 2 ? 54 : 68} height="8" rx="4" fill="#e3e1ff" />
          ))}
        </g>
        <path className="trail" d="M118 150 C150 196 196 196 190 150 C184 104 250 128 244 82 C240 52 214 44 200 42" fill="none" stroke="#c9c5ff" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" />
        {[
          [150, 172, '#b4b4c4'],
          [192, 150, '#6c63ff'],
          [236, 108, '#6c63ff'],
          [204, 44, '#f5b301'],
        ].map(([x, y, c], i) => (
          <g key={i} className={`node n${i}`} style={{ transformOrigin: `${x}px ${y}px` }}>
            <circle cx={x as number} cy={(y as number) + 4} r="19" fill="rgba(40,30,120,.18)" />
            <circle cx={x as number} cy={y as number} r="19" fill={c as string} />
            <circle cx={x as number} cy={y as number} r="19" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="3" />
            {i === 3 ? (
              <path d={`M${(x as number) - 7} ${y as number} l5 5 l9 -10`} fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <rect x={(x as number) - 6} y={(y as number) - 7} width="12" height="14" rx="3" fill="none" stroke="#fff" strokeWidth="2.6" />
            )}
          </g>
        ))}
        <circle className="spark" r="6" fill="#fff" stroke="#6c63ff" strokeWidth="3">
          <animateMotion dur="7s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;0.34;0.8;1" calcMode="linear" path="M118 150 C150 196 196 196 190 150 C184 104 250 128 244 82 C240 52 214 44 200 42" />
        </circle>
      </svg>
    </div>
  );
}

/** Memory fades; each review lifts it back and makes the next fade slower. */
export function SceneReturn() {
  return (
    <div className="sc sc-return" aria-hidden="true">
      <svg viewBox="0 0 300 220" width="100%" height="100%">
        <line x1="30" y1="30" x2="30" y2="176" stroke="#d9d6ff" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="30" y1="176" x2="284" y2="176" stroke="#d9d6ff" strokeWidth="2.5" strokeLinecap="round" />
        <text x="36" y="26" fontSize="10.5" fontWeight="700" fill="#9494aa">how much you remember</text>
        <path className="fade f0" d="M34 52 C62 54 74 132 112 146" pathLength="100" />
        <path className="fade f1" d="M112 54 C150 56 168 108 202 118" pathLength="100" />
        <path className="fade f2" d="M202 54 C240 55 258 78 284 84" pathLength="100" />
        {[
          [112, 146, 'day 1'],
          [202, 118, 'day 3'],
        ].map(([x, y, label], i) => (
          <g key={i} className={`lift v${i}`}>
            <line x1={x as number} y1={y as number} x2={x as number} y2="54" stroke="#17a673" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" />
            <g style={{ transformOrigin: `${x}px 54px` }} className="bump">
              <circle cx={x as number} cy="54" r="12" fill="#17a673" />
              <path d={`M${(x as number) - 5} 54 l4 4 l7 -8`} fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <text x={x as number} y="194" textAnchor="middle" fontSize="11" fontWeight="700" fill="#55556d">{label}</text>
          </g>
        ))}
        <text className="lift v2" x="270" y="194" textAnchor="middle" fontSize="11" fontWeight="700" fill="#55556d">day 7</text>
        <text x="40" y="194" textAnchor="middle" fontSize="11" fontWeight="700" fill="#55556d">today</text>
        <g className="lift v2">
          <rect x="196" y="20" width="88" height="24" rx="12" fill="#e6f7ef" />
          <text x="240" y="36" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f8a5d">it holds</text>
        </g>
      </svg>
    </div>
  );
}

/** A curve draws itself; a point rides it, carrying its tangent. */
export function SceneGraph() {
  const curve = 'M36 40 C84 236 216 236 264 40';
  return (
    <div className="sc sc-graph" aria-hidden="true">
      <svg viewBox="0 0 300 220" width="100%" height="100%">
        {[60, 100, 140, 180].map((y) => (
          <line key={y} x1="24" y1={y} x2="276" y2={y} stroke="#ececf5" strokeWidth="1.5" />
        ))}
        {[70, 110, 150, 190, 230].map((x) => (
          <line key={x} x1={x} y1="26" x2={x} y2="196" stroke="#ececf5" strokeWidth="1.5" />
        ))}
        <line x1="24" y1="180" x2="276" y2="180" stroke="#b9b9cc" strokeWidth="2" />
        <line x1="150" y1="26" x2="150" y2="196" stroke="#b9b9cc" strokeWidth="2" />
        <path className="curve" d={curve} pathLength="100" fill="none" stroke="#6c63ff" strokeWidth="4.5" strokeLinecap="round" />
        <g className="rider">
          <line x1="-44" y1="0" x2="44" y2="0" stroke="#1a1a2e" strokeWidth="2.6" strokeLinecap="round" />
          <circle r="8" fill="#fff" stroke="#6c63ff" strokeWidth="4" />
          <animateMotion dur="6s" repeatCount="indefinite" rotate="auto" keyPoints="0.08;0.92;0.08" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" path={curve} />
        </g>
      </svg>
      <div className="sc-chip slope">
        <i className="needle" /> slope
      </div>
      <div className="sc-chip fn"><MathView text="y = x^2 - 4" /></div>
    </div>
  );
}

/** The textbook sentence goes; a plain one arrives; and Lera asks whether it landed. */
export function ScenePlain() {
  return (
    <div className="sc sc-plain" aria-hidden="true">
      <div className="jargon">
        <span>“Apply the distributive property of multiplication over addition to each term of the binomial.”</span>
      </div>
      <div className="plainly">
        <Lera size={46} mood="happy" interactive={false} />
        <div className="bubble">
          <span>Everyone inside the bracket gets a share.</span>
          <div className="mini"><MathView text="3(x + 2) = 3x + 6" /></div>
        </div>
      </div>
      <div className="ask-row">
        <span>Did that make sense?</span>
        <i className="yes">Yes</i>
        <i>Not really</i>
      </div>
    </div>
  );
}

/** Showing up is counted: a flame, a filling bar, a new level. */
export function SceneReward() {
  return (
    <div className="sc sc-reward" aria-hidden="true">
      <div className="flame">
        <Icon name="flame" size={92} fill />
        <span className="count">
          <b>1</b>
          <b>2</b>
          <b>3</b>
        </span>
      </div>
      <div className="days">
        {['M', 'T', 'W', 'T', 'F'].map((d, i) => (
          <span key={i} className={`d${i}`}>
            <i><Icon name="check" size={11} stroke={4} /></i>
            {d}
          </span>
        ))}
      </div>
      <div className="xp">
        <div className="xp-bar"><i /></div>
        <span className="xp-tag">+15 XP</span>
      </div>
      <div className="level">Level 2 · Explorer</div>
    </div>
  );
}

/** A reminder arrives at the moment a review does the most good. */
export function SceneBell({ time }: { time: string }) {
  return (
    <div className="sc sc-bell" aria-hidden="true">
      <div className="phone">
        <span className="notch" />
        <span className="clock">{time}</span>
        <div className="push p1">
          <span className="push-ic"><Lera size={26} mood="idle" interactive={false} /></span>
          <div>
            <b>Lera <i>now</i></b>
            <span>The chain rule is ready to come back. Two minutes?</span>
          </div>
        </div>
        <div className="push p2">
          <span className="push-ic flame"><Icon name="flame" size={18} fill /></span>
          <div>
            <b>3-day streak <i>earlier</i></b>
            <span>One problem keeps it alive.</span>
          </div>
        </div>
      </div>
      <span className="bell"><Icon name="bell" size={26} /></span>
    </div>
  );
}
