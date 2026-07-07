# UNDERCAST — the "who it should hold" compilation prompt

Run the prompt below across **several different models** (Claude, GPT, Gemini,
Llama, whatever you have). Each model dumps who it thinks belongs. Merge the
outputs, dedupe on the performer's name, and you get a reference roster — the
set UNDERCAST *should* hold. Diff that against `data/specimens.json` and the gaps
are your worklist; fill them (verified) with `GROW.md` until you cover ≥90%.

**Why several models:** no single model recalls the whole field — each knows
different corners (one is strong on tokusatsu, another on 80s cartoon voices,
another on lucha). The union is far more complete than any one, and cross-model
agreement is a cheap confidence signal (if 3 models list someone, they're almost
certainly real and qualifying).

**How to merge:** concatenate the JSON arrays, lowercase the `actor` field, drop
duplicates, and keep a count of how many models listed each person (that count is
your priority + confidence score). Then dedupe against the wall:
`node -e "console.log(require('./data/specimens.json').map(s=>s.actor.toLowerCase()).join('\n'))"`.

---

## THE PROMPT (copy everything below this line into each model)

You are compiling a reference roster for **UNDERCAST**, a catalog of *performers
who vanish under a designed face* — people you have watched for hours but would
walk past on the street, because a **look was built for them and they disappeared
into it**.

### The one rule for entry
A performer qualifies ONLY if their notable work is DISAPPEARING into a designed
presence, through one of:
- **heavy prosthetic / makeup** transformation (their own face is unrecognizable)
- a **mask** (sculpted, rubber, helmet — or a luchador's mask)
- a full **creature / monster suit**
- **motion / performance capture** (their performance drives a digital character)
- an unseen **voice-only** role (a character defined by a voice; the performer is
  never on screen as themselves)

They do NOT qualify if audiences mainly know them **as themselves** (their own
face, lightly made up). Fame is not the test — *erasure* is.

### Your task
Produce as LONG and COMPLETE a list as you can of **real, verifiable** performers
who qualify. **Aim for several hundred.** Put the most iconic/canonical first,
then keep going into deep cuts. Assume other models are compiling in parallel and
the lists will be merged — so both **breadth** and **accuracy** matter. Do not
pad with people who don't fit the rule, and do not invent anyone.

### Work through EVERY category — don't stop at the obvious. Aim for 20–40+ each:
1. **Star Trek & TV aliens** — every series (TOS, TNG, DS9, VOY, ENT, DIS, PIC,
   SNW); plus Babylon 5, Farscape, Stargate, The Outer Limits, The X-Files. The
   recurring prosthetic aliens, and actors who played many different species.
2. **Doctor Who & British TV monsters** — Dalek/Cyberman operators AND voices,
   Ood/Sontaran/etc. creature performers, classic and revived series.
3. **Kaiju & tokusatsu (Japan)** — Godzilla/Gamera/Mothra/Ghidorah suit actors;
   Ultraman, Kamen Rider, Super Sentai, Kikaider, Garo suit performers.
4. **Creature-suit & animatronic performers (film)** — Alien, Predator, Hellboy,
   the del Toro creatures, the Star Wars creature bench, LOTR/Hobbit orcs & Gollum,
   Where the Wild Things Are, Gremlins, Harry Potter creatures.
5. **Motion / performance capture** — Serkis and the mo-cap generation across
   Planet of the Apes, Avatar, the MCU, King Kong, and video games (Naughty Dog,
   Mass Effect, Death Stranding, etc.).
6. **Muppets, Henson & puppeteers** — The Muppets, Sesame Street, Fraggle Rock,
   The Dark Crystal, Labyrinth, and Henson's Creature Shop work (e.g. Farscape).
7. **Masked characters & icons** — Star Wars (Vader, droids, helmeted characters);
   full-mask superheroes/villains; horror slashers (Michael Myers, Jason,
   Ghostface, Leatherface, Pinhead, Freddy, Art the Clown); and **lucha libre /
   masked pro-wrestlers** (El Santo, Blue Demon, Mil Máscaras, Rey Mysterio,
   Místico… many never unmask — perfect fits).
8. **Classic Hollywood makeup** — Lon Chaney, Karloff, Lugosi (heavy roles), the
   Universal Monsters, the Jack Pierce / Westmore eras, and the great
   makeup-transformation performances through every decade.
9. **Voice-only / the unseen cast** — animation voice legends, video-game voice
   actors, the voices behind masked characters, narrators, iconic single-role
   voices.
10. **International / non-Anglophone** — beyond Hollywood: European, Mexican
    (lucha), Japanese, Indian, and other traditions of masked/creature/voice work.

### Output format — one object per performer, so lists merge and dedupe cleanly
Return ONLY a JSON array, no prose. Each object:
```json
{"actor":"real full name","character":"the designed role they're best known for","production":"film or series","year":"YYYY or YYYY-YY","category":1-10,"kind":"face|voice","note":"one short phrase on why they qualify","confidence":"high|medium"}
```
- **Real people only.** If unsure a person or fact is real, mark
  `confidence:"medium"` — or leave them out. Never invent a person, role, or fact.
- **One entry per performer** — their single most-defining designed role.
- Use the performer's real name **as written on Wikipedia** (it is the dedupe key).
- Favor completeness within accuracy: hundreds of entries, iconic-first, then the
  deep cuts your training remembers that others might miss.

Begin.
