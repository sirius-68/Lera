import { useMemo } from 'react';
import { cleanPath, stepConcepts } from '../engine/analyze';
import { conceptOf } from '../engine/concepts';
import { Problem, SolutionStep } from '../engine/types';
import { openOverlay } from '../store/nav';
import { Icon } from './icons';
import { MathView } from './math';
import { TermText } from './terms';
import { t as tr } from '../i18n';

/**
 * A worked solution in its smallest steps: for each step the general rule (when there is one), the line, and the
 * reason in words. Working on the side (u = …, a value put in) is drawn indented, as it would be on paper.
 */
export function StepList({ problem, steps }: { problem: Problem; steps?: SolutionStep[] }) {
  const route = useMemo(() => steps ?? cleanPath(problem), [problem, steps]);
  const concepts = useMemo(() => stepConcepts(problem, route), [problem, route]);
  let n = 0;
  return (
    <ol className="route">
      {route.map((s, i) => {
        const c = concepts[i];
        // the idea behind it is spelled out the first time a step leans on it, not on every line
        const idea = c && concepts.indexOf(c) === i && route.length > 1 ? conceptOf(c) : null;
        if (!s.aside) n++;
        return (
          <li key={i} className={s.aside ? 'aside' : undefined} data-n={s.aside ? undefined : n} style={{ animationDelay: `${Math.min(i, 12) * 70}ms` }}>
            {s.rule && (
              <span className="route-rule">
                <span className="faint">{tr('The rule')}</span>
                <MathView text={s.rule} block />
              </span>
            )}
            <MathView text={s.line} block />
            <span className="muted"><TermText text={s.why} /></span>
            {idea && (
              <span className="route-why">
                <b>{tr('Why it is allowed.')}</b> <TermText text={idea.short} />{' '}
                <button className="linkbtn" onClick={() => openOverlay({ name: 'review', concept: idea.id })}>{idea.title} <Icon name="chevron" size={13} /></button>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
