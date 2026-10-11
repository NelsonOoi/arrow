"""Injectable time source. Every timestamp Flow 2 writes comes from a Clock, never from DB now()."""

from datetime import UTC, datetime, timedelta
from typing import Protocol


class Clock(Protocol):
    def now(self) -> datetime: ...


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class FakeClock:
    def __init__(self, start: datetime | None = None) -> None:
        self._now = start or datetime(2026, 10, 11, 18, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self._now

    def advance(self, seconds: float) -> datetime:
        self._now += timedelta(seconds=seconds)
        return self._now

    def set(self, when: datetime) -> None:
        if when < self._now:
            raise ValueError("FakeClock cannot go backwards")
        self._now = when
