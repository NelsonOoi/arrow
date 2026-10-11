"""Engine and session factory."""

from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from matchmaker.config import get_settings


def make_engine(url: str) -> Engine:
    # Small pool: Supabase's session pooler caps client connections per project.
    return create_engine(url, pool_size=5, max_overflow=5, pool_pre_ping=True)


@lru_cache
def get_engine() -> Engine:
    return make_engine(get_settings().database_url)


def make_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False)


@contextmanager
def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    with factory() as session, session.begin():
        yield session
