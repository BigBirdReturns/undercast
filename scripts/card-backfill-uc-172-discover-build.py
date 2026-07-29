#!/usr/bin/env python3
"""Build the UC-172 discoverer from the pinned, gate-proven UC-171 implementation."""
from __future__ import annotations

from pathlib import Path

SOURCE = Path("scripts/.card-backfill-uc-171-discover-source.mjs")
DEST = Path("scripts/.card-backfill-uc-172-discover-run.mjs")


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"UC-172 discovery build anchor count {name}: {count}")
    return text.replace(old, new, 1)


def replace_all_required(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count < 1:
        raise SystemExit(f"UC-172 discovery build anchor missing {name}")
    return text.replace(old, new)


text = SOURCE.read_text(encoding="utf-8")
for old, new, name in [
    ("UC-171", "UC-172", "record id"),
    ("Rob Paulsen", "Jim Cummings", "actor"),
    ("Yakko Warner, Pinky, Raphael", "Winnie the Pooh, Tigger, Darkwing Duck", "character set"),
    ("Animaniacs / TMNT", "Disney", "production"),
    ("images/uc-171-portrait.jpg", "images/uc-172-portrait.jpg", "portrait path"),
    ("8713888323", "8730189672", "selector artifact"),
    ("8713979812", "8730433588", "scope artifact"),
    ("2b210adfa18f23e806fd08411cf13ea967362079ed3072e38a2ce1e49978795c", "884585e330ae43dc0a0b0f6185be3a4ae8e5bda823705bf2310f82de6221190b", "scope hash"),
]:
    text = replace_all_required(text, old, new, name)

text = replace_once(
    text,
    "control.actor_role_pages?.length===4&&control.actor_role_pages.every(row=>row.strict)&&control.roles?.length===3",
    "control.actor_role_pages?.length===3&&control.actor_role_pages.every(row=>row.strict)&&control.roles?.length===3",
    "actor-role denominator",
)
text = replace_once(
    text,
    "JSON.stringify(['yakko','pinky','raphael'])",
    "JSON.stringify(['pooh','tigger','darkwing'])",
    "required role set",
)
text = replace_once(
    text,
    "control.selection_contract?.raphael_1987_original_series_required===true",
    "control.selection_contract?.pooh_inherited_voice_separation_required===true&&control.selection_contract?.tigger_inherited_voice_separation_required===true",
    "inherited voice contract",
)
text = replace_once(
    text,
    "chronology_boundary:{yakko:'Animaniacs origin in 1993.',pinky:'Animaniacs origin in 1993; later Pinky and the Brain remains the same role.',raphael:'Teenage Mutant Ninja Turtles 1987 animated series; later Donatello is a distinct role.',canonical_years_semantics:'1980s– is a broad Jim Cummings career envelope and is not projected onto Yakko or Pinky.'}",
    "chronology_boundary:{pooh:'Jim Cummings-era Winnie the Pooh is independently established; Sterling Holloway remains the original Disney Pooh voice and cannot substitute.',tigger:'Jim Cummings-era Tigger is independently established; Paul Winchell remains the earlier Disney Tigger voice and cannot substitute.',darkwing:'Darkwing Duck is bound to the animated television series beginning in 1991.',canonical_years_semantics:'1980s– is a broad Jim Cummings career envelope and is not a shared role-debut date.'}",
    "chronology map",
)
text = replace_once(
    text,
    "Yakko, Pinky, and 1987 animated Raphael each require exact role and chronology custody. Other Warner siblings, Brain, later Donatello, other turtles, live action, toys, games, posters, and incomplete composites are forbidden.",
    "Winnie the Pooh, Tigger, and Darkwing Duck each require exact Jim Cummings-era role and chronology custody. Earlier voice performers, park costumes, live action, merchandise, generic Disney ensembles, and incomplete composites are forbidden.",
    "review boundary",
)
DEST.write_text(text, encoding="utf-8")
print(f"PASS — wrote isolated UC-172 discoverer to {DEST}")
