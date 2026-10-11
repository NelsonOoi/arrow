"""ASGI entrypoint for Vercel. No background tasks there: attendee requests run due refreshes, and the dashboard
Worker calls /bridge for Run matching. Locally, use `uvicorn --factory matchmaker.api:app` instead."""

from matchmaker.api import create_app

app = create_app(run_scheduler=False, refresh_on_request=True)
