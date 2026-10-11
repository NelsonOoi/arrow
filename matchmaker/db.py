"""Engine and session factory."""

from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from matchmaker.config import get_settings


def make_engine(url: str, serverless: bool = False) -> Engine:
    if serverless:
        # Many function instances at once: let Supabase's transaction pooler (6543) do the pooling. It can't
        # keep prepared statements across transactions, so turn psycopg's automatic ones off. Locks we take are
        # all transaction-scoped (advisory xact locks, FOR UPDATE), which the transaction pooler supports.
        return create_engine(url, poolclass=NullPool, connect_args={"prepare_threshold": None})
    # Small pool: Supabase's session pooler caps client connections per project.
    return create_engine(url, pool_size=5, max_overflow=5, pool_pre_ping=True)


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    return make_engine(settings.database_url, serverless=settings.vercel)


def make_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False)


@contextmanager
def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    with factory() as session, session.begin():
        yield session
