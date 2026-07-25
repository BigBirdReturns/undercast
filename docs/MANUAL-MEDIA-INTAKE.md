# Manual media intake

Manual captures are a fallback for an exact character still that the online-source pass cannot retrieve or identify confidently. They do not need to be treated as anonymous local files: the archive can retain useful provenance even when the image was captured by a contributor.

For each capture, provide:

- UNDERCAST record ID and expected character;
- production title;
- episode title or film title, plus season/episode when applicable;
- approximate playback timestamp or other frame context;
- service, disc, broadcast, or lawful copy used for playback;
- capture date;
- the uncropped original capture, plus an optional display crop;
- a short note identifying what makes the subject exact.

Use a filename such as:

```text
UC-1296-bok-still--tng-bloodlines--00h18m42s.png
```

The intake review will hash the submitted bytes, retain the supplied context, verify that the expected subject is actually visible, and record the asset as a sourced character still. UNDERCAST does not claim ownership of the underlying production image.

Do not manually capture a performer portrait from a production merely to create an “unmasked” face. Performer portraits should come from a clearly attributable photograph, publicity source, interview, convention appearance, or other page that identifies the person. Character stills and performer portraits are separate evidence facets.

A missing facet remains `not on file` when the exact subject cannot be established. The absence state is a fallback, not a reason to skip searching.
