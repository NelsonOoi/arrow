"""Profile cards from a fixed template.

The seeker half is used when this person is the `from` side of a pair; the candidate half when they are
the `to` side. Names are left out of both halves so they can't sway scoring.
"""

import hashlib
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Profile:
    display_name: str
    side: str
    seeking_text: str
    offering_text: str
    avoid_text: str
    tags: dict[str, Any]


def _join(tags: dict[str, Any], key: str) -> str:
    values = tags.get(key) or []
    return ", ".join(values) if values else "none listed"


def seeker_half(p: Profile) -> str:
    return "\n".join(
        [
            f"Looking for: {p.seeking_text.strip()}",
            f"Wants to avoid: {p.avoid_text.strip() or 'nothing listed'}",
            f"Goals: {_join(p.tags, 'goals')}",
        ]
    )


def candidate_half(p: Profile) -> str:
    return "\n".join([f"About me: {p.offering_text.strip()}", f"Topics: {_join(p.tags, 'topics')}"])


def render_card(p: Profile) -> str:
    return f"{p.display_name} (side {p.side})\n{seeker_half(p)}\n{candidate_half(p)}"


def profile_hash(p: Profile) -> str:
    return hashlib.sha256(render_card(p).encode()).hexdigest()


def pair_state(seeker: Profile, candidate: Profile) -> str:
    """The Jev state for one directed pair."""
    return f"SEEKER\n{seeker_half(seeker)}\n\nCANDIDATE\n{candidate_half(candidate)}"
