from alembic import context
from sqlalchemy import create_engine, text

from matchmaker.config import get_settings
from matchmaker.models import SCHEMA, Base

url = context.config.attributes.get("url") or get_settings().database_url


def run() -> None:
    engine = create_engine(url)
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
        conn.commit()
        context.configure(
            connection=conn,
            target_metadata=Base.metadata,
            version_table_schema=SCHEMA,
            include_schemas=True,
        )
        with context.begin_transaction():
            context.run_migrations()


run()
