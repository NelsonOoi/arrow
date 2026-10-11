"""Settings from the environment (and .env)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
    test_database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
    typesafe_api_key: str | None = None
    scorer: str = "fake"  # fake | jev
    jev_model: str = "jev-1.13.0"
    precompute_concurrency: int = 16
    # On Vercel (which sets VERCEL=1): no client-side pool, and DATABASE_URL is the transaction pooler (6543).
    vercel: bool = False
    host_key: str | None = None  # when set, setup endpoints require `Authorization: Bearer <host_key>`
    max_duration_seconds: int = 300  # the function's maxDuration on Vercel; long work stops ~30 s before it


@lru_cache
def get_settings() -> Settings:
    return Settings()


DEFAULT_CONFIG = {
    "dealbreaker_threshold": 0.5,
    "low_confidence_threshold": 0.5,
    "refresh_window_seconds": 20,
    "refresh_min_pending": 6,  # new joiners since the last refresh that fire one early
    "base_seed": 42,
}

DEFAULT_RUBRIC = {
    "dimensions": [
        {
            "key": "goal_fit",
            "question": "How well do the candidate's goals and experience match what the seeker wants from this event?",
            "levels": ["Not at all", "Slightly", "Partly", "Mostly", "Exactly"],
            "weight": 0.4,
        },
        {
            "key": "offer_fit",
            "question": "How well does what the candidate offers meet what the seeker is looking for?",
            "levels": ["Not at all", "Slightly", "Partly", "Mostly", "Exactly"],
            "weight": 0.4,
        },
        {
            "key": "interest_overlap",
            "question": "How much do the seeker's and candidate's interests and topics overlap?",
            "levels": ["None", "A little", "Some", "A lot", "Nearly all"],
            "weight": 0.2,
        },
    ],
    "dealbreaker_question": "Does the candidate match anything the seeker said they want to avoid?",
}
