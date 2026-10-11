/**
 * App frame: left rail (wordmark, Events, Settings) + routed content.
 * On narrow screens the rail becomes a top bar (styles/app.css .rail).
 */
import { Link, NavLink, Outlet } from 'react-router-dom';

import { ArrowGlyph, Scribble } from './HandMarks';

export function AppShell() {
  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <Link to="/events" className="rail__brand">
          <ArrowGlyph />
          <span className="rail__word">Arrow</span>
        </Link>
        <div className="rail__nav">
          <NavLink to="/events" className="rail__link">
            {({ isActive }) => (
              <>
                Events
                {isActive && <Scribble />}
              </>
            )}
          </NavLink>
          {/* Settings is a stub: no screen yet. */}
          <NavLink to="/settings" className="rail__link">
            {({ isActive }) => (
              <>
                Settings
                {isActive && <Scribble />}
              </>
            )}
          </NavLink>
        </div>
        <p className="rail__foot">Arrow points you to the people you came to meet.</p>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
