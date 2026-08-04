#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path
from textwrap import dedent

ROOT_HTML = ["index.html", "recognition.html", "coverage.html", "constellation.html", "404.html"]


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_maker_routes(text: str) -> str:
    replacements = {
        'href="./index.html#makers"': 'href="./makers.html"',
        "href='./index.html#makers'": "href='./makers.html'",
        'href="index.html#makers"': 'href="makers.html"',
        "href='index.html#makers'": "href='makers.html'",
        'href="/undercast/index.html#makers"': 'href="/undercast/makers.html"',
        "href='/undercast/index.html#makers'": "href='/undercast/makers.html'",
        'href="../../index.html#makers"': 'href="../../makers.html"',
        "href='../../index.html#makers'": "href='../../makers.html'",
        'href="#makers"': 'href="./makers.html"',
        "href='#makers'": "href='./makers.html'",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def add_makers_to_root_lists(text: str) -> str:
    if "makers.html" in text:
        return text
    pairs = [
        ('"coverage.html", "constellation.html"', '"coverage.html", "makers.html", "constellation.html"'),
        ("'coverage.html', 'constellation.html'", "'coverage.html', 'makers.html', 'constellation.html'"),
        ('"coverage.html",\n  "constellation.html"', '"coverage.html",\n  "makers.html",\n  "constellation.html"'),
        ("'coverage.html',\n  'constellation.html'", "'coverage.html',\n  'makers.html',\n  'constellation.html'"),
    ]
    for old, new in pairs:
        if old in text:
            text = text.replace(old, new, 1)
            return text
    return text


for filename in ROOT_HTML:
    path = Path(filename)
    if path.exists():
        write(filename, replace_maker_routes(read(filename)))

builder = "scripts/build-record-pages.mjs"
if Path(builder).exists():
    write(builder, replace_maker_routes(read(builder)))

coverage = read("coverage.html")
header_match = re.search(r"<header\b[\s\S]*?</header>", coverage, re.IGNORECASE)
if header_match:
    header = header_match.group(0)
else:
    header = dedent('''
    <header class="site-header">
      <div class="site-shell">
        <a class="site-brand" href="./index.html">UNDERCAST</a>
        <nav class="site-nav" aria-label="Archive navigation">
          <a href="./index.html">Browse</a>
          <a href="./recognition.html">Recognition Loop</a>
          <a href="./coverage.html">Coverage</a>
          <a href="./makers.html">Makers</a>
          <a href="./index.html#about">About</a>
        </nav>
      </div>
    </header>
    ''').strip()

header = replace_maker_routes(header)
header = re.sub(r'\s+aria-current=("|\')[^"\']*\1', '', header)
maker_anchor = re.search(r'<a\b[^>]*href=("|\')[^"\']*makers\.html[^"\']*\1[^>]*>', header, re.IGNORECASE)
if maker_anchor:
    original = maker_anchor.group(0)
    if "aria-current" not in original:
        header = header.replace(original, original[:-1] + ' aria-current="page">', 1)
else:
    nav_end = header.lower().rfind("</nav>")
    if nav_end >= 0:
        header = header[:nav_end] + '<a href="./makers.html" aria-current="page">Makers</a>' + header[nav_end:]

archive_match = re.search(r'<nav\b[^>]*class=("|\')[^"\']*archive-map[^"\']*\1[\s\S]*?</nav>', coverage, re.IGNORECASE)
archive_map = replace_maker_routes(archive_match.group(0)) if archive_match else dedent('''
<nav class="archive-map" aria-label="Archive paths">
  <span class="archive-map__label">Archive paths</span>
  <a href="./index.html">The wall</a>
  <a href="./recognition.html">Recognition records</a>
  <a href="./coverage.html">Coverage &amp; gaps</a>
  <a href="./constellation.html">Evidence paths</a>
  <a href="./data/archive.json">Machine archive</a>
</nav>
''').strip()

makers_html = dedent(f'''\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script>document.documentElement.classList.add("js")</script>
<title>Makers — UNDERCAST</title>
<meta name="description" content="Browse exact maker-credit wording filed in UNDERCAST, linked back to the records that carry it without inventing a verified person or organization.">
<link rel="canonical" href="https://bigbirdreturns.github.io/undercast/makers.html">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<script src="./assets/site-theme.js"></script>
<link rel="stylesheet" href="./assets/site-tokens.css">
<link rel="stylesheet" href="./assets/site-shell.css">
<link rel="stylesheet" href="./assets/makers.css">
<script src="./assets/site-navigation.js" defer></script>
<script src="./assets/makers.js" defer></script>
</head>
<body data-site-page="makers">
<a class="skip-link" href="#maker-results">Skip to maker credits</a>
{header}
<main class="makers-shell site-shell">
  <section class="makers-hero" aria-labelledby="makers-title">
    <p class="makers-kicker">Filed credit register</p>
    <h1 id="makers-title">Makers, as credited.</h1>
    <p class="makers-lede">This surface groups the <strong>exact wording already filed on UNDERCAST records</strong>. A name-shaped label is not promoted into a verified person, and a shop-shaped label is not promoted into a verified organization. The categories below are presentation aids, not identity adjudications.</p>
    <div class="makers-boundary" role="note">
      <b>Read the label literally.</b>
      <span>Each result preserves source-facing credit wording and links to the exact records carrying it. Ambiguous and unmatched lines remain visible instead of being silently discarded.</span>
    </div>
  </section>

  <section class="makers-controls" aria-label="Filter maker credits">
    <label class="makers-search">Search exact credit wording, work, production, performer, or method
      <input id="maker-search" type="search" autocomplete="off" placeholder="Try creature shop, prosthetics, a production, or a performer">
    </label>
    <label>Presentation group
      <select id="maker-kind">
        <option value="all">All filed wording</option>
        <option value="individual-style">Individual-style wording</option>
        <option value="organization-style">Shop or organization-style wording</option>
        <option value="team-department">Team or department wording</option>
        <option value="unresolved">Unresolved or compound wording</option>
      </select>
    </label>
    <button id="maker-clear" type="button">Clear filters</button>
  </section>

  <section class="makers-status" aria-live="polite" aria-atomic="true">
    <p id="maker-summary">Loading filed maker credits…</p>
  </section>

  <section id="maker-results" class="maker-results" aria-busy="true" data-ready="false" tabindex="-1"></section>
  <section id="maker-empty" class="maker-state" hidden>
    <h2>No filed credit wording matches this view.</h2>
    <p>Clear one or both filters. A missing result is not evidence that no maker credit exists outside the currently filed corpus.</p>
  </section>
  <section id="maker-error" class="maker-state maker-error" hidden role="alert">
    <h2>The maker-credit projection is unavailable.</h2>
    <p>No partial register has been substituted. Retry the repository-owned data request or inspect the machine archive directly.</p>
    <button id="maker-retry" type="button">Retry maker credits</button>
    <a href="./data/archive.json">Open machine archive</a>
  </section>

  <noscript>
    <section class="maker-state">
      <h2>The interactive register needs JavaScript.</h2>
      <p>The evidence boundary does not. Browse the <a href="./data/archive.json">machine archive</a>, use the <a href="./index.html">wall</a>, or open <a href="./coverage.html">Coverage</a>. No identity classification is hidden behind the script.</p>
    </section>
  </noscript>
</main>
{archive_map}
</body>
</html>
''')
write("makers.html", makers_html)

makers_css = dedent(r'''
:root{--makers-paper:var(--plaster,#e8e3d9);--makers-ink:var(--ink,#1c1a16);--makers-muted:var(--ink-soft,#655f56);--makers-rule:var(--line,#b8b0a3);--makers-accent:var(--grease,#a43a2d);--makers-seam:var(--seam,#456d69)}
*{box-sizing:border-box}.makers-shell{padding-top:64px;padding-bottom:110px}.makers-hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(260px,.8fr);gap:18px 46px;border-bottom:2px solid var(--makers-ink);padding-bottom:34px}.makers-kicker{grid-column:1/-1;margin:0;color:var(--makers-accent);font:700 10px/1.2 "Space Mono",monospace;letter-spacing:.22em;text-transform:uppercase}.makers-hero h1{margin:0;font:600 clamp(46px,8vw,92px)/.92 "Fraunces",serif;letter-spacing:-.035em}.makers-lede{margin:0;align-self:end;color:var(--makers-muted);font:17px/1.55 "Fraunces",serif}.makers-lede strong{color:var(--makers-ink)}.makers-boundary{grid-column:1/-1;display:grid;grid-template-columns:minmax(180px,.35fr) 1fr;gap:18px;border-top:1px solid var(--makers-rule);padding-top:18px;margin-top:10px;font:12px/1.55 "Space Mono",monospace}.makers-boundary b{color:var(--makers-accent);text-transform:uppercase;letter-spacing:.12em}.makers-boundary span{color:var(--makers-muted)}
.makers-controls{display:grid;grid-template-columns:minmax(260px,1fr) minmax(220px,.42fr) auto;gap:14px;align-items:end;padding:28px 0 20px;border-bottom:1px solid var(--makers-rule)}.makers-controls label{display:grid;gap:8px;color:var(--makers-muted);font:10px/1.4 "Space Mono",monospace;letter-spacing:.1em;text-transform:uppercase}.makers-controls input,.makers-controls select,.makers-controls button,.maker-state button{min-height:48px;border:1px solid var(--makers-ink);border-radius:0;background:transparent;color:var(--makers-ink);padding:11px 13px;font:13px/1.3 "Space Mono",monospace}.makers-controls button,.maker-state button{cursor:pointer;text-transform:uppercase;letter-spacing:.1em}.makers-controls input:focus-visible,.makers-controls select:focus-visible,.makers-controls button:focus-visible,.maker-state button:focus-visible,.maker-card a:focus-visible{outline:2px solid var(--makers-accent);outline-offset:3px}.makers-controls button:hover,.maker-state button:hover{background:var(--makers-ink);color:var(--makers-paper)}
.makers-status{min-height:56px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--makers-rule)}.makers-status p{margin:0;color:var(--makers-muted);font:11px/1.5 "Space Mono",monospace}.maker-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px}.maker-card{min-width:0;border-bottom:1px solid var(--makers-rule);padding:26px 0}.maker-card:target{outline:2px solid var(--makers-accent);outline-offset:5px}.maker-card-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.maker-label{margin:0;overflow-wrap:anywhere;font:600 clamp(23px,3vw,34px)/1.05 "Fraunces",serif}.maker-kind{flex:0 0 auto;border:1px solid var(--makers-rule);padding:4px 6px;color:var(--makers-muted);font:9px/1.2 "Space Mono",monospace;letter-spacing:.08em;text-transform:uppercase}.maker-exact{margin:10px 0 0;color:var(--makers-muted);font:11px/1.5 "Space Mono",monospace}.maker-exact b{color:var(--makers-ink)}.maker-context{display:flex;flex-wrap:wrap;gap:6px;margin:15px 0 0;padding:0;list-style:none}.maker-context li{border-left:2px solid var(--makers-seam);padding-left:7px;color:var(--makers-muted);font:10px/1.4 "Space Mono",monospace}.maker-works{display:grid;gap:9px;margin-top:17px}.maker-work{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;border-top:1px dotted var(--makers-rule);padding-top:9px;text-decoration:none}.maker-work:hover .maker-work-title{text-decoration:underline;text-decoration-color:var(--makers-accent);text-underline-offset:3px}.maker-work-title{font:600 15px/1.25 "Fraunces",serif}.maker-work-meta{display:block;margin-top:3px;color:var(--makers-muted);font:9px/1.45 "Space Mono",monospace}.maker-record-id{color:var(--makers-accent);font:9px/1.4 "Space Mono",monospace;letter-spacing:.06em}.maker-more{margin:9px 0 0;color:var(--makers-muted);font:10px/1.45 "Space Mono",monospace}.maker-state{margin-top:28px;border:1px solid var(--makers-ink);padding:24px}.maker-state h2{margin:0;font:600 28px/1.1 "Fraunces",serif}.maker-state p{max-width:68ch;color:var(--makers-muted);font:13px/1.55 "Space Mono",monospace}.maker-state a{color:var(--makers-accent)}.maker-error{border-left:6px solid var(--makers-accent)}.maker-error button{margin-right:12px}
@media(max-width:760px){.makers-shell{padding-top:38px}.makers-hero{grid-template-columns:1fr}.makers-lede{font-size:16px}.makers-boundary{grid-template-columns:1fr}.makers-controls{grid-template-columns:1fr}.makers-controls button{width:100%}.maker-results{grid-template-columns:1fr}.maker-card{padding:22px 0}.maker-card-head{display:block}.maker-kind{display:inline-block;margin-top:10px}.maker-work{grid-template-columns:1fr}.maker-record-id{justify-self:start}.makers-status{min-height:64px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
''')
write("assets/makers.css", makers_css)

makers_js = dedent(r'''
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const results = $("maker-results");
  const summary = $("maker-summary");
  const empty = $("maker-empty");
  const error = $("maker-error");
  const search = $("maker-search");
  const kind = $("maker-kind");
  const clear = $("maker-clear");
  const retry = $("maker-retry");
  const state = { credits: [], records: new Map(), query: "", kind: "all" };

  const text = value => value == null ? "" : String(value).trim();
  const array = value => Array.isArray(value) ? value : value == null ? [] : [value];
  const first = (object, keys) => {
    if (!object || typeof object !== "object") return "";
    for (const key of keys) { const value = text(object[key]); if (value) return value; }
    return "";
  };
  const recordId = value => {
    if (typeof value === "string") return /^UC-\d+$/i.test(value.trim()) ? value.trim().toUpperCase() : "";
    return first(value, ["record_id", "recordId", "specimen_id", "specimenId", "id"]);
  };
  const slug = label => {
    let hash = 2166136261;
    for (const char of label) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
    const base = label.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/[\s_]+/g, "-").slice(0, 48) || "credit";
    return `credit-${base}-${(hash >>> 0).toString(36)}`;
  };
  const classify = label => {
    const value = label.trim();
    if (/\b(team|department|dept\.?|unit|crew|staff)\b/i.test(value)) return "team-department";
    if (/\b(studio|studios|shop|workshop|effects|fx|company|co\.|inc\.?|ltd\.?|llc|group|associates|creature shop|laborator(?:y|ies)|productions?)\b/i.test(value)) return "organization-style";
    if (/^[\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]+){1,4}$/u.test(value)) return "individual-style";
    return "unresolved";
  };
  const kindLabel = value => ({
    "individual-style": "individual-style wording",
    "organization-style": "shop / organization-style wording",
    "team-department": "team / department wording",
    unresolved: "unresolved / compound wording",
  })[value] || "filed wording";

  const findMakerProjection = archive => {
    const candidates = [archive?.makers, archive?.maker_credits, archive?.makerCredits, archive?.facets?.makers, archive?.index?.makers, archive?.data?.makers];
    return candidates.find(candidate => candidate && (Array.isArray(candidate) || typeof candidate === "object"));
  };
  const refsFrom = item => {
    if (!item || typeof item !== "object") return [];
    const values = [item.records, item.record_ids, item.recordIds, item.specimens, item.cards, item.works, item.ids, item.references];
    const ids = [];
    for (const value of values) for (const entry of array(value)) { const id = recordId(entry); if (id) ids.push(id); }
    const direct = recordId(item);
    if (direct) ids.push(direct);
    return [...new Set(ids)];
  };
  const normalizeProjection = projection => {
    const rows = [];
    if (Array.isArray(projection)) {
      for (const item of projection) {
        if (typeof item === "string") rows.push({ label: item, ids: [] });
        else if (item && typeof item === "object") {
          const label = first(item, ["label", "name", "credit", "maker", "raw", "value", "title"]);
          if (label) rows.push({ label, ids: refsFrom(item), contexts: item });
        }
      }
    } else if (projection && typeof projection === "object") {
      for (const [label, value] of Object.entries(projection)) {
        if (!label) continue;
        rows.push({ label, ids: refsFrom({ records: value }), contexts: value });
      }
    }
    return rows;
  };
  const strictMakerValues = record => {
    const values = [];
    const accept = value => {
      if (typeof value === "string" && value.trim()) values.push(value.trim());
      else if (Array.isArray(value)) value.forEach(accept);
      else if (value && typeof value === "object") {
        const label = first(value, ["label", "name", "credit", "raw", "value"]);
        if (label) values.push(label);
        else Object.values(value).forEach(accept);
      }
    };
    for (const key of ["maker", "makers", "maker_credit", "makerCredit", "maker_credits", "makerCredits"]) accept(record?.[key]);
    accept(record?.credits?.maker); accept(record?.credits?.makers); accept(record?.making?.makers);
    return [...new Set(values)];
  };
  const recordsFrom = payload => {
    if (Array.isArray(payload)) return payload;
    for (const key of ["records", "specimens", "cards", "items"]) if (Array.isArray(payload?.[key])) return payload[key];
    return [];
  };
  const mergeCredits = (projectionRows, records) => {
    const byLabel = new Map();
    const add = (label, id, contexts) => {
      const exact = text(label); if (!exact) return;
      const key = exact.normalize("NFKC");
      const row = byLabel.get(key) || { label: exact, ids: new Set(), contexts: [], kind: classify(exact) };
      if (id) row.ids.add(id);
      if (contexts) row.contexts.push(contexts);
      byLabel.set(key, row);
    };
    for (const row of projectionRows) {
      if (row.ids.length) row.ids.forEach(id => add(row.label, id, row.contexts)); else add(row.label, "", row.contexts);
    }
    for (const record of records) {
      const id = recordId(record);
      for (const label of strictMakerValues(record)) add(label, id, record);
    }
    return [...byLabel.values()].map(row => ({ ...row, ids: [...row.ids] })).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  };
  const contextFor = record => ({
    title: first(record, ["character", "name", "title", "role", "subject"]) || "Filed record",
    performer: first(record, ["actor", "performer", "person", "portrayed_by", "portrayedBy"]),
    production: first(record, ["production", "work", "episode", "series", "universe", "franchise"]),
    method: first(record, ["method", "mode", "technique", "performance_mode", "performanceMode"]),
  });
  const el = (tag, className, value) => {
    const node = document.createElement(tag); if (className) node.className = className; if (value != null) node.textContent = value; return node;
  };
  const renderCard = credit => {
    const article = el("article", "maker-card"); article.id = slug(credit.label); article.dataset.kind = credit.kind;
    const head = el("div", "maker-card-head"); head.append(el("h2", "maker-label", credit.label), el("span", "maker-kind", kindLabel(credit.kind))); article.append(head);
    const exact = el("p", "maker-exact"); const exactLead = el("b", "", "Filed wording: "); exact.append(exactLead, document.createTextNode(credit.label)); article.append(exact);
    const contextList = el("ul", "maker-context");
    const contexts = new Set();
    for (const id of credit.ids) {
      const record = state.records.get(id); if (!record) continue;
      const context = contextFor(record); for (const value of [context.production, context.method]) if (value) contexts.add(value);
    }
    for (const value of [...contexts].slice(0, 6)) contextList.append(el("li", "", value));
    if (contextList.childElementCount) article.append(contextList);
    const works = el("div", "maker-works");
    for (const id of credit.ids.slice(0, 8)) {
      const record = state.records.get(id); const context = contextFor(record || {});
      const link = el("a", "maker-work"); link.href = `./records/${encodeURIComponent(id)}/`; link.setAttribute("aria-label", `${context.title}, record ${id}`);
      const copy = el("span", ""); copy.append(el("span", "maker-work-title", context.title));
      const metadata = [context.performer, context.production, context.method].filter(Boolean).join(" · "); if (metadata) copy.append(el("span", "maker-work-meta", metadata));
      link.append(copy, el("span", "maker-record-id", id)); works.append(link);
    }
    if (works.childElementCount) article.append(works);
    if (credit.ids.length > 8) article.append(el("p", "maker-more", `${credit.ids.length - 8} additional exact record link${credit.ids.length - 8 === 1 ? "" : "s"} retained in this filed label.`));
    if (!credit.ids.length) article.append(el("p", "maker-more", "This exact credit wording is retained in the projection, but no safely linkable record identifier was exposed by the current public index."));
    return article;
  };
  const searchable = credit => {
    const pieces = [credit.label, credit.kind];
    for (const id of credit.ids) { const record = state.records.get(id); const context = contextFor(record || {}); pieces.push(id, context.title, context.performer, context.production, context.method); }
    return pieces.filter(Boolean).join(" ").toLocaleLowerCase();
  };
  const syncUrl = () => {
    const url = new URL(location.href); state.query ? url.searchParams.set("q", state.query) : url.searchParams.delete("q"); state.kind !== "all" ? url.searchParams.set("kind", state.kind) : url.searchParams.delete("kind"); history.replaceState(null, "", url);
  };
  const render = () => {
    const query = state.query.toLocaleLowerCase();
    const visible = state.credits.filter(credit => (state.kind === "all" || credit.kind === state.kind) && (!query || searchable(credit).includes(query)));
    results.replaceChildren(...visible.map(renderCard));
    results.dataset.ready = "true"; results.setAttribute("aria-busy", "false");
    empty.hidden = visible.length !== 0; error.hidden = true;
    const linked = visible.reduce((total, credit) => total + credit.ids.length, 0);
    summary.textContent = `${visible.length} of ${state.credits.length} exact filed credit labels shown · ${linked} exact record link${linked === 1 ? "" : "s"}. Categories are non-authoritative presentation groups.`;
    syncUrl();
    if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" }));
  };
  const load = async () => {
    results.dataset.ready = "false"; results.setAttribute("aria-busy", "true"); results.replaceChildren(); empty.hidden = true; error.hidden = true; summary.textContent = "Loading filed maker credits…";
    try {
      const [archiveResponse, specimensResponse] = await Promise.all([fetch("./data/archive.json", { cache: "no-store" }), fetch("./data/specimens.json", { cache: "no-store" })]);
      if (!archiveResponse.ok || !specimensResponse.ok) throw new Error(`projection status ${archiveResponse.status}/${specimensResponse.status}`);
      const [archive, specimensPayload] = await Promise.all([archiveResponse.json(), specimensResponse.json()]);
      const records = recordsFrom(specimensPayload); state.records = new Map(records.map(record => [recordId(record), record]).filter(([id]) => id));
      const projection = findMakerProjection(archive); const projectionRows = normalizeProjection(projection);
      state.credits = mergeCredits(projectionRows, records);
      if (!state.credits.length) throw new Error("no filed maker-credit labels were exposed by the current projections");
      render();
    } catch (cause) {
      console.error("Makers projection unavailable", cause); results.setAttribute("aria-busy", "false"); results.dataset.ready = "false"; error.hidden = false; summary.textContent = "Maker-credit projection unavailable; no partial register shown.";
    }
  };
  const params = new URL(location.href).searchParams; state.query = params.get("q") || ""; state.kind = params.get("kind") || "all";
  search.value = state.query; if ([...kind.options].some(option => option.value === state.kind)) kind.value = state.kind; else state.kind = "all";
  search.addEventListener("input", () => { state.query = search.value.trim(); render(); });
  kind.addEventListener("change", () => { state.kind = kind.value; render(); });
  clear.addEventListener("click", () => { search.value = ""; kind.value = "all"; state.query = ""; state.kind = "all"; render(); search.focus(); });
  retry.addEventListener("click", load);
  addEventListener("hashchange", () => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" }));
  load();
})();
''')
write("assets/makers.js", makers_js)

for script_path in ["scripts/site-seams.mjs", "scripts/site-sweep.mjs", "scripts/site-sweep-fixtures.mjs"]:
    path = Path(script_path)
    if not path.exists():
        continue
    text = add_makers_to_root_lists(read(script_path))
    text = text.replace("five root surfaces", "six root surfaces")
    text = text.replace("Five root surfaces", "Six root surfaces")
    write(script_path, text)

# Add makers to common rendered root lists without replacing existing UX contracts.
for test_path in ["tests/rendered/site.spec.mjs", "tests/rendered/ux-journeys.spec.mjs"]:
    path = Path(test_path)
    if path.exists():
        write(test_path, add_makers_to_root_lists(read(test_path)))

makers_test = dedent(r'''
import { test, expect } from "@playwright/test";

const ROOT = "http://127.0.0.1:4173/undercast";

const waitForRegister = async page => {
  await page.locator("#maker-results").waitFor({ state: "attached" });
  await expect(page.locator("#maker-results")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
};

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name === "ux-visual-chromium", "Makers behavior is covered by the compatibility matrix, not the fixed UX-02 visual baseline set.");
});

test("Makers exposes exact filed wording without claiming verified identity", async ({ page }) => {
  await page.goto(`${ROOT}/makers.html`, { waitUntil: "domcontentloaded" });
  await waitForRegister(page);
  await expect(page.getByRole("heading", { name: "Makers, as credited." })).toBeVisible();
  await expect(page.getByText(/categories below are presentation aids, not identity adjudications/i)).toBeVisible();
  const cards = page.locator(".maker-card");
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first().locator(".maker-exact")).toContainText("Filed wording:");
  await expect(page.locator("#maker-summary")).toContainText("exact filed credit labels shown");
});

test("Makers search and presentation groups are deep-linkable state", async ({ page }) => {
  await page.goto(`${ROOT}/makers.html`, { waitUntil: "domcontentloaded" });
  await waitForRegister(page);
  const first = page.locator(".maker-card").first();
  const label = (await first.locator(".maker-label").innerText()).trim();
  await page.locator("#maker-search").fill(label);
  await expect(page.locator(".maker-card")).toHaveCount(1);
  await expect(page).toHaveURL(/\?q=/);
  const id = await page.locator(".maker-card").first().getAttribute("id");
  expect(id).toMatch(/^credit-/);
  await page.evaluate(value => { location.hash = value; }, id);
  await expect(page).toHaveURL(new RegExp(`#${id}$`));
  const group = await page.locator(".maker-card").first().getAttribute("data-kind");
  await page.locator("#maker-search").fill("");
  await page.locator("#maker-kind").selectOption(group);
  await expect(page).toHaveURL(new RegExp(`kind=${group}`));
  expect(await page.locator(".maker-card").count()).toBeGreaterThan(0);
});

test("Makers links filed wording back to exact permanent records when identifiers exist", async ({ page }) => {
  await page.goto(`${ROOT}/makers.html`, { waitUntil: "domcontentloaded" });
  await waitForRegister(page);
  const links = page.locator("a.maker-work");
  expect(await links.count()).toBeGreaterThan(0);
  const href = await links.first().getAttribute("href");
  expect(href).toMatch(/^\.\/records\/UC-\d+\/$/);
  await links.first().click();
  await expect(page).toHaveURL(/\/records\/UC-\d+\/$/);
  await expect(page.getByRole("navigation", { name: "Archive navigation", exact: true })).toBeAttached();
});

test("Makers refuses a partial register and recovers in place", async ({ page }) => {
  await page.route("**/data/archive.json", route => route.abort("failed"));
  await page.goto(`${ROOT}/makers.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#maker-error")).toBeVisible();
  await expect(page.locator("#maker-results")).toHaveAttribute("data-ready", "false");
  await expect(page.locator(".maker-card")).toHaveCount(0);
  await page.unroute("**/data/archive.json");
  await page.locator("#maker-retry").click();
  await waitForRegister(page);
  expect(await page.locator(".maker-card").count()).toBeGreaterThan(0);
});
''')
write("tests/rendered/makers.spec.mjs", makers_test)

readiness_path = Path("docs/UX-READINESS.md")
readiness = read(readiness_path.as_posix())
if "## UX-04 — exact maker-credit discovery" not in readiness:
    readiness += "\n\n" + dedent(r'''
## UX-04 — exact maker-credit discovery

The first-class Makers route treats an exact filed credit label—not a presumed person,
shop or legal entity—as its public unit. It consumes existing canonical projections,
preserves the original wording, and links only to exact record identifiers already
exposed by the corpus. Individual-style, shop/organization-style, team/department and
unresolved groupings are reversible presentation aids. They carry no identity authority.

Search spans the filed label and safely exposed record context such as work, production,
performer and method. Ambiguous or unmatched full credit lines remain visible. Projection
failure produces an explicit refusal and in-page retry; no partial register is silently
substituted. The no-JavaScript state preserves routes to the machine archive, wall and
Coverage. UX-04 adds no maker decision, source ruling, corpus field or parser promotion.
''').strip() + "\n"
    write(readiness_path.as_posix(), readiness)

decisions_path = Path("docs/DECISIONS.md")
decisions = read(decisions_path.as_posix())
if "## DEC-0017" in decisions:
    raise SystemExit("DEC-0017 already exists; refuse duplicate authority")
decision = dedent(r'''
## DEC-0017 — Makers exposes filed credit wording, not inferred identity

**Status:** Active · Ratified by owner direction in issue #242, implemented by UX-04, 2026-08-04

DEC-0012 remains the default operating rule. This decision authorizes one bounded,
corpus-disjoint discovery surface for maker credits already filed in canonical UNDERCAST
records and projections:

- The public unit is the exact filed credit label. A name-shaped string is not thereby a
  verified person; a shop-shaped string is not thereby a verified organization.
- Individual-style, shop or organization-style, team or department, and unresolved or
  compound groupings are explicitly non-authoritative presentation aids.
- Search may combine exact wording with safely exposed record context, including work,
  production, performer and method, and may link only to exact existing record IDs.
- Ambiguous, unmatched and compound lines remain visible. The interface must not discard
  them merely because no single identity can be safely reduced from the wording.
- Missing projections fail closed. A partial register must not be substituted, and retry
  remains repository-owned rather than dependent on an outside human.

This decision creates no maker entity, identity merge, source ruling, maker adjudication,
credit parser authority, specimen field, media decision, queue, lease, waterline, account,
service or schema concept. Corpus truth remains owned by the collection lane. A later
identity model may supersede a presentation grouping only through separately evidenced
and authorized corpus work.
''').strip()
write(decisions_path.as_posix(), decisions.rstrip() + "\n\n---\n\n" + decision + "\n")
