"""Tests run against the local Supabase CLI database (`npx supabase@2.118.0 start`).

Each pytest session creates a throwaway database, migrates it with Alembic, and drops it afterwards.
"""

import os
import uuid

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from matchmaker.clock import FakeClock
from matchmaker.config import get_settings
from matchmaker.db import make_sessionmaker


@pytest.fixture(scope="session")
def engine():
    base = make_url(os.environ.get("TEST_DATABASE_URL") or get_settings().test_database_url)
    name = f"mm_test_{uuid.uuid4().hex[:8]}"
    admin = create_engine(base, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as c:
            c.execute(text(f'CREATE DATABASE "{name}"'))
    except Exception as e:  # pragma: no cover
        pytest.exit(f"Test database unavailable at {base!r}: start it with `npx supabase@2.118.0 start` ({e})", 2)
    url = base.set(database=name)
    cfg = Config("alembic.ini")
    cfg.attributes["url"] = url.render_as_string(hide_password=False)
    command.upgrade(cfg, "head")
    eng = create_engine(url, pool_size=20, max_overflow=10)
    yield eng
    eng.dispose()
    with admin.connect() as c:
        c.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
    admin.dispose()


@pytest.fixture
def sf(engine):
    return make_sessionmaker(engine)


@pytest.fixture
def clock():
    return FakeClock()
