/**
 * Arrow host web app (MVP) — entry point and routes.
 *
 *   /events                              EventsOverview  (landing; import lives here)
 *   /events/:eventId/setup/import        ImportStep      (setup 1: what was imported from Partiful)
 *   /events/:eventId/setup/questions     QuestionsStep   (setup 2: call plan; "Finish setup" starts calls)
 *   /events/:eventId                     EventDashboard  (after setup: metrics, text blast, check-in, guests)
 *
 * Design rules: host/DESIGN.md. Data model: src/types.ts. Mocks: src/mock/ (grep "MOCK:").
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { EventsOverview } from './screens/EventsOverview';
import { ImportStep } from './screens/ImportStep';
import { EventDashboard } from './screens/EventDashboard';
import { NotFound } from './screens/NotFound';
import { QuestionsStep } from './screens/QuestionsStep';
import { StoreProvider } from './store';
import './styles/tokens.css';
import './styles/app.css';

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Navigate to="/events" replace /> },
      { path: '/events', element: <EventsOverview /> },
      { path: '/events/:eventId/setup/import', element: <ImportStep /> },
      { path: '/events/:eventId/setup/questions', element: <QuestionsStep /> },
      { path: '/events/:eventId', element: <EventDashboard /> },
      { path: '/settings', element: <NotFound what="settings page (not built yet)" /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <RouterProvider router={router} />
    </StoreProvider>
  </StrictMode>,
);
