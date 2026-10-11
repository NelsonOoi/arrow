"""JevScorer: one TypeSafe System One request per directed pair (Score per rubric dimension + one Noul).

SDK retries are disabled; the worker owns retries so `pair_scores.attempts` is accurate.
"""

import logging
import time
from typing import Any

from typesafe_sdk import (
    AsyncTypeSafeClient,
    Noul,
    RetryPolicy,
    Score,
    TypeSafeAPIConnectionError,
    TypeSafeAPIError,
)

from matchmaker.cards import Profile, pair_state
from matchmaker.precompute.scorer import DimensionResult, JevResult, RetryableScorerError

log = logging.getLogger(__name__)

DEALBREAKER_KEY = "dealbreaker"


class JevScorer:
    def __init__(self, model: str = "jev-1.13.0", api_key: str | None = None) -> None:
        self.model = model
        self.client = AsyncTypeSafeClient(api_key=api_key, model=model, retry=RetryPolicy(max_retries=0))

    async def check_model(self) -> None:
        listed = await self.client.models.list()
        names = {m.name for m in listed.models}
        if self.model not in names:
            raise RuntimeError(f"{self.model} is not offered by the API (available: {sorted(names)})")

    async def aclose(self) -> None:
        await self.client.aclose()

    async def score(self, seeker: Profile, candidate: Profile, rubric: dict[str, Any]) -> JevResult:
        questions: dict[str, Any] = {
            d["key"]: Score(instructions=d["question"], criteria=list(d["levels"])) for d in rubric["dimensions"]
        }
        # An empty avoid list can't match anything; skip the Noul (Jev reads negation literally).
        ask_dealbreaker = bool(seeker.avoid_text.strip())
        if ask_dealbreaker:
            questions[DEALBREAKER_KEY] = Noul(instructions=rubric["dealbreaker_question"])

        started = time.monotonic()
        try:
            resp = await self.client.system_one(state=pair_state(seeker, candidate), questions=questions, model=self.model)
        except TypeSafeAPIConnectionError as e:  # includes timeouts
            raise RetryableScorerError(str(e)) from e
        except TypeSafeAPIError as e:
            if e.status in (408, 429) or e.status >= 500:
                raise RetryableScorerError(f"HTTP {e.status}") from e
            raise
        latency_ms = int((time.monotonic() - started) * 1000)
        log.info(
            "jev call request_id=%s latency_ms=%d input_tokens=%s output_tokens=%s",
            resp.request_id, latency_ms, resp.usage.input_tokens, resp.usage.output_tokens,
        )
        if resp.model != self.model:
            raise RuntimeError(f"expected {self.model}, API answered with {resp.model}")

        dims = {}
        for d in rubric["dimensions"]:
            a = resp.scores[d["key"]]
            n = len(d["levels"])
            probs = [float(a.probabilities.get(i, 0.0)) for i in range(n)]
            dims[d["key"]] = DimensionResult(
                level=max(range(n), key=lambda i: probs[i]),
                expected=float(a.score),
                probabilities=probs,
                confidence=float(a.confidence),
            )
        dealbreaker = float(resp.nouls[DEALBREAKER_KEY].noul) if ask_dealbreaker else 0.0
        raw = resp.model_dump(mode="json")
        raw["latency_ms"] = latency_ms
        return JevResult(dimensions=dims, dealbreaker_prob=dealbreaker, raw_response=raw, request_id=resp.request_id)
