/**
 * The two-step setup trail shown on every setup screen:
 * Import → Questions. Finishing Questions opens the event dashboard.
 * Completed steps link back.
 */
import { Link } from 'react-router-dom';

import type { SetupStep } from '../types';
import { Scribble } from './HandMarks';

const STEPS: { key: SetupStep; label: string }[] = [
  { key: 'import', label: 'Import' },
  { key: 'questions', label: 'Questions' },
];

export function SetupSteps({ eventId, current }: { eventId: string; current: SetupStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="steps">
      <Link to="/events" className="back-link">
        ← All events
      </Link>
      <ol aria-label="Setup steps">
        {STEPS.map((s, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo';
          return (
            <li key={s.key} className={`step step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="step__num">{state === 'done' ? '✓' : i + 1}</span>
              {state === 'done' ? <Link to={`/events/${eventId}/setup/${s.key}`}>{s.label}</Link> : <span>{s.label}</span>}
              {state === 'current' && <Scribble />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
