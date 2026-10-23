// A closed presentation boundary over the existing compiled archive.
// Profiles do not interpret evidence, edit records, remove destinations, or run code.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const NAV_IDS = ['about', 'browse', 'coverage', 'makers', 'recognition'];
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function exactKeys(value, keys, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label}: unknown or missing setting`);
}
function text(value, maximum, label) {
  assert.ok(typeof value === 'string' && value.length > 0 && value.length <= maximum && value === value.trim(), `${label}: invalid text length or whitespace`);
  assert.ok(!/[<>\x00-\x1f\x7f]/.test(value), `${label}: markup and controls are forbidden`);
}
export function validateWebsiteProfile(value) {
  exactKeys(value, ['version','id','base_url','brand','navigation','layout'], 'website profile');
  assert.equal(value.version, 1, 'unsupported website profile version');
  assert.match(value.id, /^[a-z][a-z0-9-]{0,39}$/, 'invalid profile id');
  assert.equal(typeof value.base_url, 'string', 'base_url must be a string');
  const base = new URL(value.base_url);
  assert.ok(base.protocol === 'https:' && !base.username && !base.password && !base.port && !base.search && !base.hash, 'base_url must be an HTTPS directory without credentials, port, query or fragment');
  assert.equal(base.href, value.base_url, 'base_url must already be normalized');
  assert.match(base.pathname, /^\/(?:[A-Za-z0-9_-]+\/)*$/, 'base_url must have a safe directory path and trailing slash');
  exactKeys(value.brand, ['name','tagline'], 'brand');
  text(value.brand.name, 40, 'brand.name'); text(value.brand.tagline, 120, 'brand.tagline');
  assert.ok(Array.isArray(value.navigation), 'navigation must be an array');
  for (const row of value.navigation) {
    exactKeys(row, ['id','label'], 'navigation entry'); text(row.label, 32, 'navigation label');
  }
  assert.deepEqual(value.navigation.map(row => row.id).sort(), NAV_IDS, 'navigation must retain all five destinations exactly once');
  exactKeys(value.layout, ['max_width','card_min_width','gap'], 'layout');
  for (const [key, low, high] of [['max_width',960,1600],['card_min_width',268,420],['gap',16,32]]) {
    assert.ok(Number.isInteger(value.layout[key]) && value.layout[key] >= low && value.layout[key] <= high, `layout.${key} must be ${low}..${high}`);
  }
  return structuredClone(value);
}
function once(html, pattern, replacement, label) {
  let count = 0;
  const result = html.replace(pattern, (...args) => { count++; return replacement(...args); });
  assert.equal(count, 1, `${label}: expected exactly one existing template slot, got ${count}`);
  return result;
}
function navigation(body, profile, file, sourceBase) {
  const elements = body.match(/<a\b[^>]*>[\s\S]*?<\/a>|<button\b[^>]*>[\s\S]*?<\/button>/g) || [];
  assert.equal(body.replace(/<a\b[^>]*>[\s\S]*?<\/a>|<button\b[^>]*>[\s\S]*?<\/button>/g, '').trim(), '', 'unsupported navigation markup');
  const links = new Map(), extras = [];
  for (const element of elements) {
    if (element.startsWith('<button')) { extras.push(element); continue; }
    const match = element.match(/\bhref=["']([^"']+)["']/); assert.ok(match, 'navigation link has no href');
    const url = new URL(match[1].replaceAll('&amp;', '&'), sourceBase + file);
    const home = new URL('index.html', sourceBase).pathname;
    let id = null;
    if (url.pathname === home || url.pathname === new URL(sourceBase).pathname) {
      id = {'#archive':'browse','#makers':'makers','#about':'about'}[url.hash] || null;
    } else if (url.pathname === new URL('recognition.html', sourceBase).pathname) id = 'recognition';
    else if (url.pathname === new URL('coverage.html', sourceBase).pathname) id = 'coverage';
    if (id) { assert.ok(!links.has(id), `duplicate primary destination: ${id}`); links.set(id, element); }
    else {
      assert.match(element, />Permanent record<\/a>$/, 'unrecognized primary destination');
      extras.push(element);
    }
  }
  assert.deepEqual([...links.keys()].sort(), NAV_IDS, 'existing navigation destination set changed');
  const configured = profile.navigation.map(row => links.get(row.id).replace(/>[^<]*<\/a>$/, () => `>${esc(row.label)}</a>`));
  return [...configured, ...extras].join('');
}
// Rebase deployment metadata only. Canonical specimen/source strings never pass here.
export function rebaseDataset(value, sourceBase, targetBase) {
  if (typeof value === 'string') return value.startsWith(sourceBase) ? targetBase + value.slice(sourceBase.length) : value;
  if (Array.isArray(value)) return value.map(item => rebaseDataset(item, sourceBase, targetBase));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,rebaseDataset(item,sourceBase,targetBase)]));
  return value;
}
export function renderProfileHtml(input, file, profile, sourceBase, { preview = true } = {}) {
  validateWebsiteProfile(profile);
  const sourcePath = new URL(sourceBase).pathname, targetPath = new URL(profile.base_url).pathname;
  // Shield all script/style bodies, including JS template strings containing HTML.
  const raw = [];
  assert.ok(!input.includes('UC_PROFILE_RAW_BLOCK_'), 'reserved template sentinel');
  const previousName = input.match(/class="[^"]*\bsite-wordmark\b[^"]*"[^>]*>([^<]*)</)?.[1] || 'UNDERCAST';
  let html = input.replace(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/g, (whole, tag, attrs, body) => {
    let opening = `<${tag}${attrs}>`;
    opening = opening.replace(/\bsrc="([^"]+)"/g, (all, url) => url.startsWith(sourcePath) ? `src="${targetPath}${url.slice(sourcePath.length)}"` : all);
    if (tag === 'script' && /type="application\/ld\+json"/.test(attrs)) body = JSON.stringify(rebaseDataset(JSON.parse(body), sourceBase, profile.base_url)).replaceAll('<','\\u003c');
    const token = `UC_PROFILE_RAW_BLOCK_${raw.length}_END`;
    raw.push(`${opening}${body}</${tag}>`); return token;
  });
  html = html.replace(/<aside class="website-profile-notice"[\s\S]*?<\/aside>/g, '');
  html = html.replace(/<link\b[^>]*href="[^"]*assets\/website-profile\.css"[^>]*>/g, '');
  html = once(html, /(<nav\b[^>]*\bclass="[^"]*\bsite-nav\b[^"]*"[^>]*>)([\s\S]*?)(<\/nav>)/g,
    (all, start, body, end) => start + navigation(body, profile, file, sourceBase) + end, `${file} navigation`);
  html = once(html, /(<(span|a|div)\b[^>]*\bclass="[^"]*\bsite-wordmark\b[^"]*"[^>]*>)[^<]*(<\/\2>)/g,
    (all, start, tag, end) => start + esc(profile.brand.name) + end, `${file} wordmark`);
  html = once(html, /(<(span|div)\b[^>]*\bclass="[^"]*\bsite-tagline\b[^"]*"[^>]*>)[^<]*(<\/\2>)/g,
    (all, start, tag, end) => start + esc(profile.brand.tagline) + end, `${file} tagline`);
  html = html.replaceAll(`aria-label="${previousName} home"`, () => `aria-label="${esc(profile.brand.name)} home"`);
  html = once(html, /<title>([^<]+)<\/title>/g,
    (all, title) => `<title>${title.replace(previousName, () => esc(profile.brand.name))}</title>`, `${file} title`);
  if (file === 'index.html' && (profile.brand.name !== 'UNDERCAST' || html.includes('class="profile-wordmark"'))) {
    html = once(html, /<h1>(?:<span class="u">UNDER<\/span><span class="cast-word">CAST<\/span>)<\/h1>|<h1 class="profile-wordmark">[^<]*<\/h1>/g,
      () => `<h1 class="profile-wordmark">${esc(profile.brand.name)}</h1>`, 'homepage title');
  }
  // Preview metadata never claims to be a released production website.
  if (preview) html = html.replace(/<meta\b[^>]*(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*/g, '');
  html = html.replace(/<meta\b[^>]*name="robots"[^>]*>\s*/g, '');
  html = html.replace(/(<link\b[^>]*\brel="canonical"[^>]*\bhref=")([^"]+)(")/g,
    (all, start, url, end) => start + (url.startsWith(sourceBase) ? profile.base_url + url.slice(sourceBase.length) : url) + end);
  if (!preview) html = html.replace(/(<meta\b[^>]*(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*content=")([^"]*)(")/g,
    (all,start,value,end) => start + value.replace(previousName, () => esc(profile.brand.name)) + end);
  // Root-absolute recovery dependencies must also work at the configured subpath.
  html = html.replace(/\b(href|src)="([^"]+)"/g, (all, attr, url) =>
    url.startsWith(sourcePath) ? `${attr}="${targetPath}${url.slice(sourcePath.length)}"` : all);
  if (preview) html = html.replaceAll('current deployment: release.json', 'website profile preview; no deployment receipt');
  const prefix = file === '404.html' ? targetPath : '../'.repeat(file.split('/').length - 1) || './';
  const fontLink = /href="[^"]*assets\/site-fonts\.css"/.test(html) ? '' : `<link rel="stylesheet" href="${prefix}assets/site-fonts.css">`;
  html = once(html, /<\/head>/g, () => `${fontLink}<link rel="stylesheet" href="${prefix}assets/website-profile.css">${preview ? '<meta name="robots" content="noindex,nofollow">' : ''}</head>`, `${file} head`);
  if (preview) html = once(html, /<body>/g, () => `<body><aside class="website-profile-notice" aria-label="Website profile preview">Presentation preview: ${esc(profile.id)}. Same archive and evidence states. <a href="${esc(sourceBase)}data/archive.json">Canonical source</a>.</aside>`, `${file} body`);
  html = html.replace(/UC_PROFILE_RAW_BLOCK_(\d+)_END/g, (all, index) => raw[Number(index)]);
  return html;
}
export function profileStyles(profile) {
  const {max_width, card_min_width, gap} = validateWebsiteProfile(profile).layout;
  return `/* Generated from a closed website profile; the shared palette remains canonical. */
:root{--profile-width:${max_width}px;--profile-card-min:${card_min_width}px;--profile-gap:${gap}px}
.wrap,.uc-wrap,.coverage-wrap,.constellation-wrap,.record-wrap,.archive-map,body>.site-shell{max-width:var(--profile-width)}
#grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,var(--profile-card-min)),1fr));gap:var(--profile-gap)}
.site-brand{min-width:0;max-width:100%}
.site-wordmark{white-space:normal;overflow-wrap:anywhere}
.site-wordmark,.eyebrow,.uc-kicker,.record-kicker{font-family:var(--mono)}
.site-tagline,h1,h2,h3,.coverage-wrap h1,.benchmark h2,.intro,.benchmark-copy,.scope,.metrics b,.node h2,.node h3,.ledger h2{font-family:var(--display)}
.profile-wordmark{font-size:clamp(32px,5vw,72px);overflow-wrap:anywhere}
.website-profile-notice{box-sizing:border-box;margin:0;padding:10px 24px;border-bottom:1px solid var(--rule);background:var(--paper);color:var(--ink);font:12px/1.6 var(--mono)}
.website-profile-notice a{color:inherit;text-decoration:underline;text-underline-offset:3px}
.website-profile-notice a:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
@media(max-width:700px){.website-profile-notice{padding:10px 16px}}
`;
}

// Pure, shared compilation for the released site and isolated alternate views.
// Only deployment metadata and presentation may differ; archive bytes stay fixed.
export function configureWebsite(sourceFiles, profile, source, {preview = true} = {}) {
  validateWebsiteProfile(profile);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const meta = (file, bytes) => ({path:file, bytes:bytes.length, sha256:digest(bytes)});
  const files = new Map(sourceFiles);
  const json = file => JSON.parse(files.get(file));
  const put = (file, value) => files.set(file, Buffer.isBuffer(value) ? value : Buffer.from(value));
  const originalArchive = files.get('data/archive.json');
  const archive = json('data/archive.json'), sourceBase = archive.canonical_url;
  const protectedEntries = [...files].filter(([file]) => !file.endsWith('.html') && ![
    'data/archive.json','data/dataset.jsonld','sitemap.xml','robots.txt',
    'assets/website-profile.css','website-profile.json',
  ].includes(file));
  for (const [file, bytes] of files) if (file.endsWith('.html')) {
    const original = bytes.toString();
    const rendered = renderProfileHtml(original, file, profile, sourceBase, {preview});
    if (file.startsWith('records/')) {
      const main = original.match(/<main\b[\s\S]*?<\/main>/)?.[0];
      assert.ok(main, `record main absent: ${file}`);
      assert.equal(rendered.match(/<main\b[\s\S]*?<\/main>/)?.[0], main, `record evidence changed: ${file}`);
    }
    put(file, rendered);
  }
  put('assets/website-profile.css', profileStyles(profile));
  const preserved = protectedEntries.map(([file,bytes]) => meta(file,bytes)).sort((a,b)=>a.path<b.path?-1:1);
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value;
  const info = {version:1,status:preview?'preview':'production',release_authority:false,profile,
    source:{canonical_url:sourceBase,archive_sha256:digest(originalArchive),input_sha256:source.input_sha256,media_sha256:source.media_sha256},
    preserved_payload_sha256:digest(JSON.stringify(stable(preserved))),
    note:'Presentation configuration, not a release receipt. Canonical evidence and media remain unchanged. Only release.json issued by the complete release gate certifies deployment.'};
  put('website-profile.json',JSON.stringify(info,null,2)+'\n');
  archive.canonical_url=profile.base_url;
  archive.web_assets=archive.web_assets.filter(row=>!['assets/website-profile.css','website-profile.json'].includes(row.path)).map(row=>meta(row.path,files.get(row.path)));
  for(const file of ['assets/website-profile.css','website-profile.json'])archive.web_assets.push(meta(file,files.get(file)));
  put('data/archive.json',JSON.stringify(archive,null,1)+'\n');
  put('data/dataset.jsonld',JSON.stringify(rebaseDataset(json('data/dataset.jsonld'),sourceBase,profile.base_url),null,1)+'\n');
  put('sitemap.xml',files.get('sitemap.xml').toString().replaceAll(sourceBase,()=>profile.base_url));
  put('robots.txt',preview?`User-agent: *\nDisallow: /\nSitemap: ${profile.base_url}sitemap.xml\n`:files.get('robots.txt').toString().replaceAll(sourceBase,()=>profile.base_url));
  for(const [file,bytes] of protectedEntries) assert.ok(files.get(file).equals(bytes),`protected bytes changed: ${file}`);
  const check=value=>{if(!value||typeof value!=='object')return;if(value.path&&value.sha256){assert.ok(files.has(value.path),`missing declared payload: ${value.path}`);assert.deepEqual(meta(value.path,files.get(value.path)),{path:value.path,bytes:value.bytes,sha256:value.sha256},`configured contract drift: ${value.path}`);}for(const child of Object.values(value))check(child);};
  check(archive);
  return {files,preserved_payload_sha256:info.preserved_payload_sha256};
}
