/** Fallback for unknown routes or event ids. */
import { ButtonLink } from '../components/ui';

export function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)', alignItems: 'flex-start' }}>
      <h1>
        Can’t find that <em>{what}</em>
      </h1>
      <ButtonLink to="/events" variant="ink">
        Back to events
      </ButtonLink>
    </div>
  );
}
