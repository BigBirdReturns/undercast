#!/usr/bin/env python3
"""Build the UC-174 discoverer from the pinned, gate-proven UC-171 implementation."""
from __future__ import annotations

from pathlib import Path

SOURCE = Path("scripts/.card-backfill-uc-171-discover-source.mjs")
DEST = Path("scripts/.card-backfill-uc-174-discover-run.mjs")


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"UC-174 discovery build anchor count {name}: {count}")
    return text.replace(old, new, 1)


def replace_all_required(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count < 1:
        raise SystemExit(f"UC-174 discovery build anchor missing {name}")
    return text.replace(old, new)


text = SOURCE.read_text(encoding="utf-8")
for old, new, name in [
    ("UC-171", "UC-174", "record id"),
    ("Rob Paulsen", "John DiMaggio", "actor"),
    ("Yakko Warner, Pinky, Raphael", "Bender, Jake the Dog, Marcus Fenix", "character set"),
    ("Animaniacs / TMNT", "Futurama / Adventure Time / Gears of War", "production"),
    ("1980s–", "1990s–", "career envelope"),
    ("images/uc-171-portrait.jpg", "images/uc-174-portrait.jpg", "portrait path"),
    ("8713888323", "8733385683", "selector artifact"),
    ("8713979812", "8733521198", "scope artifact"),
    ("2b210adfa18f23e806fd08411cf13ea967362079ed3072e38a2ce1e49978795c", "21e8c533c0498dc2ec83e345a25c1a082a20d003be601a01bc209918e814985f", "scope hash"),
]:
    text = replace_all_required(text, old, new, name)

text = replace_once(
    text,
    "control.selection_contract?.exact_three_role_animated_character_composite_required===true",
    "control.selection_contract?.exact_three_role_cross_medium_character_composite_required===true",
    "cross-medium composite contract",
)
text = replace_once(
    text,
    "JSON.stringify(['yakko','pinky','raphael'])",
    "JSON.stringify(['bender','jake','marcus'])",
    "required role set",
)
text = replace_once(
    text,
    "control.selection_contract?.raphael_1987_original_series_required===true",
    "control.selection_contract?.marcus_gears_game_character_required===true",
    "Marcus game-role contract",
)
text = replace_once(
    text,
    "chronology_boundary:{yakko:'Animaniacs origin in 1993.',pinky:'Animaniacs origin in 1993; later Pinky and the Brain remains the same role.',raphael:'Teenage Mutant Ninja Turtles 1987 animated series; later Donatello is a distinct role.',canonical_years_semantics:'1990s– is a broad John DiMaggio career envelope and is not projected onto Yakko or Pinky.'}",
    "chronology_boundary:{bender:'Futurama original television production beginning in 1999.',jake:'Adventure Time animated television role, including the original short and series continuity.',marcus:'Gears of War video-game role performed by John DiMaggio.',canonical_years_semantics:'1990s– is a broad John DiMaggio career envelope and is not a shared role-debut date.'}",
    "chronology map",
)
text = replace_once(
    text,
    "Yakko, Pinky, and 1987 animated Raphael each require exact role and chronology custody. Other Warner siblings, Brain, later Donatello, other turtles, live action, toys, games, posters, and incomplete composites are forbidden.",
    "Bender, Jake the Dog, and Marcus Fenix each require exact John DiMaggio role, production, medium, and chronology custody. Other robots, other Adventure Time characters, other COG soldiers, replacement performers, live action, costumes, toys, cosplay, posters, and incomplete composites are forbidden.",
    "review boundary",
)
DEST.write_text(text, encoding="utf-8")
print(f"PASS — wrote isolated UC-174 discoverer to {DEST}")
