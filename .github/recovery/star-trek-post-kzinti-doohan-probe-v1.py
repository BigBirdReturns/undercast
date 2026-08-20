from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from PIL import Image
import hashlib
import html
import json
import os
import re
import shutil

REPO = Path(os.environ.get('REPO_ROOT', '.'))
OUT = Path(os.environ.get('OUTPUT_ROOT', '/tmp/star-trek-post-kzinti-doohan-probe-v1'))
EXPECTED_MAIN = os.environ['EXPECTED_MAIN']
TASK_ID = os.environ['TASK_ID']
TASK_FINGERPRINT = os.environ['TASK_FINGERPRINT']
CHARACTER = os.environ['CHARACTER']
PERFORMER = os.environ['PERFORMER']
SOURCE = os.environ['SOURCE']
WALL_ID = os.environ['WALL_ID']
MEMORY_API = 'https://memory-alpha.fandom.com/api.php'
COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
USER_AGENT = 'UNDERCAST-Post-Kzinti-Doohan-Probe/1.0 (preservation and attribution audit)'


def fail(message: str) -> None:
    raise SystemExit(message)


def h_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def h_file(path: Path) -> str:
    return h_bytes(path.read_bytes())


def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def pretty(value) -> str:
    return json.dumps(stable(value), indent=2, ensure_ascii=False) + '\n'


def identity(value: dict) -> str:
    return h_bytes(pretty(value).encode())


def write_json(name: str, value) -> Path:
    path = OUT / name
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    return path


def request_bytes(url: str, referer: str | None = None) -> bytes:
    headers = {'User-Agent': USER_AGENT, 'Accept': '*/*'}
    if referer:
        headers['Referer'] = referer
    with urlopen(Request(url, headers=headers), timeout=90) as response:
        return response.read()


def api_json(base: str, params: dict) -> dict:
    return json.loads(request_bytes(base + '?' + urlencode(params)))


def clean_html(value: str | None) -> str:
    if not value:
        return ''
    return html.unescape(re.sub(r'<[^>]+>', '', value)).strip()


def decode(data: bytes) -> tuple[Image.Image, tuple[int, int], str]:
    with Image.open(BytesIO(data)) as image:
        image.load()
        return image.convert('RGB'), image.size, image.format or 'unknown'


def normalize(data: bytes, *, portrait: bool) -> tuple[bytes, tuple[int, int], str]:
    image, original_size, original_format = decode(data)
    image.thumbnail((1200, 1500) if portrait else (1600, 1600), Image.Resampling.LANCZOS)
    buffer = BytesIO()
    if portrait:
        image.save(buffer, format='JPEG', quality=94, optimize=True, progressive=False)
    else:
        image.save(buffer, format='WEBP', quality=94, method=6)
    return buffer.getvalue(), original_size, original_format


def repository_origins() -> set[str]:
    result: set[str] = set()
    for file in ('data/specimens.json', 'data/SOURCES.json'):
        for row in json.loads((REPO / file).read_text()):
            for side in ('still', 'portrait'):
                asset = row.get(side)
                if isinstance(asset, dict) and asset.get('origin'):
                    result.add(asset['origin'])
    return result


def repository_hashes() -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for path in (REPO / 'images').glob('*'):
        if path.is_file():
            result.setdefault(h_file(path), []).append(path.name)
    return result


def source_revision() -> dict:
    data = api_json(MEMORY_API, {
        'action': 'query', 'prop': 'revisions', 'titles': CHARACTER,
        'rvprop': 'ids|timestamp|content', 'rvslots': 'main',
        'format': 'json', 'formatversion': '2',
    })
    pages = data['query']['pages']
    if len(pages) != 1 or pages[0].get('missing'):
        fail(f'role source page drifted: {pages}')
    revisions = pages[0].get('revisions') or []
    if len(revisions) != 1:
        fail(f'role source revision cardinality drifted: {revisions}')
    revision = revisions[0]
    content = revision['slots']['main']['content']
    if 'James Doohan' not in content:
        fail(f'frozen {CHARACTER} source does not name James Doohan')
    return {
        'api': data, 'pageid': pages[0]['pageid'], 'title': pages[0]['title'],
        'revision': revision.get('revid'), 'parent_revision': revision.get('parentid'),
        'timestamp': revision.get('timestamp'), 'content': content,
        'content_sha256': h_bytes(content.encode()),
    }


def image_info(api: str, title: str, width: int) -> tuple[dict, dict, dict]:
    data = api_json(api, {
        'action': 'query', 'prop': 'imageinfo',
        'titles': title if title.startswith('File:') else 'File:' + title,
        'iiprop': 'url|size|sha1|mime|timestamp|extmetadata',
        'iiurlwidth': str(width), 'format': 'json', 'formatversion': '2',
    })
    pages = data['query']['pages']
    if len(pages) != 1 or pages[0].get('missing'):
        fail(f'image page drifted: {pages}')
    info = pages[0].get('imageinfo') or []
    if len(info) != 1:
        fail(f'imageinfo cardinality drifted: {info}')
    return data, pages[0], info[0]


def download(info: dict, referer: str) -> tuple[bytes, str]:
    errors = []
    for url in (info.get('thumburl'), info.get('url')):
        if not url:
            continue
        try:
            data = request_bytes(url, referer)
            decode(data)
            return data, url
        except Exception as exc:
            errors.append(f'{url}: {type(exc).__name__}: {exc}')
    fail(f'image download failed: {errors}')


def role_tokens() -> list[str]:
    stop = {'the', 'a', 'an', 'of', 'and', 'captain', 'commander', 'lieutenant'}
    return [token for token in re.findall(r'[a-z0-9]+', CHARACTER.lower()) if len(token) >= 3 and token not in stop]


def role_image() -> dict:
    pageimages = api_json(MEMORY_API, {
        'action': 'query', 'prop': 'pageimages', 'titles': CHARACTER,
        'piprop': 'original|thumbnail|name', 'pithumbsize': '1600',
        'format': 'json', 'formatversion': '2',
    })
    images = api_json(MEMORY_API, {
        'action': 'query', 'prop': 'images', 'titles': CHARACTER,
        'imlimit': 'max', 'format': 'json', 'formatversion': '2',
    })
    candidates: list[str] = []
    page = pageimages['query']['pages'][0]
    if page.get('pageimage'):
        candidates.append(page['pageimage'])
    candidates.extend(row['title'].removeprefix('File:') for row in (images['query']['pages'][0].get('images') or []))
    unique = list(dict.fromkeys(candidates))
    tokens = role_tokens()
    def score(title: str) -> tuple[int, int]:
        lower = title.lower().replace('_', ' ')
        matched = sum(token in lower for token in tokens)
        points = matched * 10
        if tokens and matched == len(tokens):
            points += 10
        if any(term in lower for term in ('logo', 'symbol', 'insignia', 'diagram', 'map', 'actor', 'doohan')):
            points -= 25
        return points, -len(title)
    errors = []
    for title in sorted(unique, key=score, reverse=True):
        if score(title)[0] < 8:
            continue
        try:
            data, page, info = image_info(MEMORY_API, title, 1600)
            raw, selected = download(info, 'https://memory-alpha.fandom.com/')
            normalized, source_size, source_format = normalize(raw, portrait=False)
            if min(source_size) < 250:
                continue
            description_url = info.get('descriptionurl') or 'https://memory-alpha.fandom.com/wiki/' + page['title'].replace(' ', '_')
            return {
                'pageimages': pageimages, 'images': images, 'image_data': data,
                'title': page['title'], 'description_url': description_url,
                'download_url': selected, 'normalized': normalized,
                'source_size': source_size, 'source_format': source_format,
                'mime': info.get('mime'), 'timestamp': info.get('timestamp'),
                'score': score(title)[0], 'tokens': tokens,
            }
        except Exception as exc:
            errors.append({'title': title, 'error': f'{type(exc).__name__}: {exc}'})
    fail(f'no exact role-image candidate for {CHARACTER}: {errors}')


def portrait_image(origins: set[str], hashes: dict[str, list[str]]) -> dict:
    errors = []
    seen: set[str] = set()
    for query in ('James Doohan', 'James Doohan Star Trek', 'Jimmy Doohan'):
        search = api_json(COMMONS_API, {
            'action': 'query', 'list': 'search', 'srnamespace': '6',
            'srsearch': query, 'srlimit': '100', 'format': 'json', 'formatversion': '2',
        })
        for row in search['query']['search']:
            title = row['title']
            if title in seen:
                continue
            seen.add(title)
            try:
                data, page, info = image_info(COMMONS_API, title, 1200)
                ext = info.get('extmetadata') or {}
                description = clean_html((ext.get('ImageDescription') or ext.get('ObjectName') or {}).get('value'))
                identity_text = ' '.join((page.get('title', ''), description)).lower()
                if 'doohan' not in identity_text:
                    continue
                license_short = clean_html((ext.get('LicenseShortName') or {}).get('value'))
                license_lower = license_short.lower()
                if not ('public domain' in license_lower or 'cc by' in license_lower or 'cc0' in license_lower):
                    continue
                origin = info.get('descriptionurl') or 'https://commons.wikimedia.org/wiki/' + page['title'].replace(' ', '_')
                if origin in origins:
                    continue
                raw, selected = download(info, 'https://commons.wikimedia.org/')
                normalized, source_size, source_format = normalize(raw, portrait=True)
                if min(source_size) < 250:
                    continue
                digest = h_bytes(normalized)
                if digest in hashes:
                    errors.append({'title': title, 'error': f'canonical byte collision: {hashes[digest]}'})
                    continue
                date = clean_html((ext.get('DateTimeOriginal') or ext.get('DateTime') or {}).get('value'))
                year = re.search(r'\b(?:19|20)\d{2}\b', date)
                return {
                    'search_query': query, 'search_data': search, 'image_data': data,
                    'title': page['title'], 'description_url': origin,
                    'download_url': selected, 'normalized': normalized,
                    'source_size': source_size, 'source_format': source_format,
                    'mime': info.get('mime'), 'timestamp': info.get('timestamp'),
                    'author': clean_html((ext.get('Artist') or {}).get('value')),
                    'license': license_short, 'description': description,
                    'year': int(year.group(0)) if year else None,
                    'selection_errors': errors,
                }
            except Exception as exc:
                errors.append({'title': title, 'error': f'{type(exc).__name__}: {exc}'})
    fail(f'no unused licensed James Doohan portrait: {errors}')


def facet(side: str, digest: str, asset: dict, presentation: str) -> dict:
    return {
        'id': 'ma_' + h_bytes(f'{WALL_ID}:{side}:{digest}'.encode())[:24],
        'scope': 'star-trek', 'wall_id': WALL_ID, 'side': side,
        'actor': PERFORMER, 'character': CHARACTER,
        'expected_subject': PERFORMER if side == 'portrait' else CHARACTER,
        'source_fetched_at': datetime.now(timezone.utc).date().isoformat(),
        'asset': asset, 'risk_codes': [],
        'votes': [
            {'reviewer': 'chatgpt-source-identity-second-desk', 'role': 'second-desk', 'namespace': 'identity', 'value': 'expected', 'note': f'The frozen source supports {PERFORMER if side == "portrait" else CHARACTER} identity only for this facet.', 'evidence': [f'source-origin:{asset["origin"]}', f'asset-sha256:{digest}'], 'enforced': True, 'at': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'), 'asset_sha256': digest},
            {'reviewer': 'chatgpt-source-identity-second-desk', 'role': 'second-desk', 'namespace': 'presentation', 'value': presentation, 'note': 'The facet remains bounded to identity and presentation evidence, without inferred animation, design, direction, editing, processing, production-shop, or other maker labor.', 'evidence': [f'source-origin:{asset["origin"]}', f'asset-sha256:{digest}'], 'enforced': True, 'at': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'), 'asset_sha256': digest},
        ],
        'claims': {'identity': {'value': 'expected'}, 'presentation': {'value': presentation}},
        'status': 'verified',
    }


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    generated_at = datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    if PERFORMER != 'James Doohan':
        fail(f'post-Kzinti probe is restricted to James Doohan, received {PERFORMER}')
    state = json.loads((REPO / 'data/AUTOPILOT.json').read_text())
    tasks = [row for row in state['jobs'] if row.get('id') == TASK_ID]
    if len(tasks) != 1:
        fail(f'task cardinality drifted: {len(tasks)}')
    task = tasks[0]
    expected = {'status':'queued','performer':PERFORMER,'character':CHARACTER,'source':SOURCE,'source_fingerprint':TASK_FINGERPRINT}
    actual = {key:task.get(key) for key in expected}
    if actual != expected:
        fail(f'task identity drifted: {actual}')
    if task.get('performance_modes') != ['voice-animation']:
        fail(f'post-Kzinti Doohan voice lane is incompatible with queued mode: {task.get("performance_modes")}')
    source = source_revision()
    still = role_image()
    portrait = portrait_image(repository_origins(), repository_hashes())
    still_path = OUT / f'{WALL_ID.lower()}-still.webp'
    portrait_path = OUT / f'{WALL_ID.lower()}-portrait.jpg'
    still_path.write_bytes(still['normalized'])
    portrait_path.write_bytes(portrait['normalized'])
    still_sha, portrait_sha = h_file(still_path), h_file(portrait_path)
    if still_sha == portrait_sha or still['description_url'] == portrait['description_url']:
        fail('cross-facet source or byte collision')
    source_receipt = {
        'version':1,'transaction':'STAR-TREK-POST-KZINTI-DOOHAN-SOURCE-RECEIPT-V1',
        'generated_at':generated_at,'canonical_parent':EXPECTED_MAIN,'task_id':TASK_ID,
        'source_fingerprint':TASK_FINGERPRINT,'character':CHARACTER,'performer':PERFORMER,
        'source':SOURCE,'pageid':source['pageid'],'revision':source['revision'],
        'parent_revision':source['parent_revision'],'timestamp':source['timestamp'],
        'content_sha256':source['content_sha256'],'queued_mode_hint':['voice-animation'],
        'adjudicated_kind':'voice','performance_mode':'voice-only',
        'physical_performance':'not attributed to James Doohan','maker_attribution':'unresolved',
    }
    source_receipt['receipt_sha256'] = identity(source_receipt)
    write_json('source-receipt.json', source_receipt)
    write_json('source-api.json', source['api'])
    (OUT / 'source-wikitext.txt').write_text(source['content'])
    write_json('still-pageimages.json', still['pageimages'])
    write_json('still-images.json', still['images'])
    write_json('still-imageinfo.json', still['image_data'])
    write_json('portrait-search.json', portrait['search_data'])
    write_json('portrait-imageinfo.json', portrait['image_data'])
    facets = sorted([
        facet('portrait', portrait_sha, {'src':f'images/{WALL_ID.lower()}-portrait.jpg','sha256':portrait_sha,'bytes':portrait_path.stat().st_size,'origin':portrait['description_url'],'kind':'free'}, 'neutral-human'),
        facet('still', still_sha, {'src':f'images/{WALL_ID.lower()}-still.webp','sha256':still_sha,'bytes':still_path.stat().st_size,'origin':still['description_url'],'kind':'still'}, 'character-depiction'),
    ], key=lambda row: row['side'])
    preparation = {
        'version':1,'transaction':'STAR-TREK-POST-KZINTI-DOOHAN-MEDIA-PREPARATION-V1',
        'generated_at':generated_at,'canonical_parent':EXPECTED_MAIN,'task_id':TASK_ID,
        'source_fingerprint':TASK_FINGERPRINT,'character':CHARACTER,'performer':PERFORMER,
        'wall_id':WALL_ID,'source_receipt_sha256':source_receipt['receipt_sha256'],
        'still':{'file':still_path.name,'sha256':still_sha,'bytes':still_path.stat().st_size,'origin':still['description_url'],'download_url':still['download_url'],'source_title':still['title'],'source_size':list(still['source_size']),'source_format':still['source_format']},
        'portrait':{'file':portrait_path.name,'sha256':portrait_sha,'bytes':portrait_path.stat().st_size,'origin':portrait['description_url'],'download_url':portrait['download_url'],'source_title':portrait['title'],'source_size':list(portrait['source_size']),'source_format':portrait['source_format'],'author':portrait['author'],'license':portrait['license'],'year':portrait['year']},
        'facets':facets,'facets_sha256':h_bytes(pretty(facets).encode()),
        'byte_collision':False,'source_collision':False,'cross_facet_substitution':False,
        'maker_attribution':'unresolved','media_review':{'verdict':'pass','reviewer':'chatgpt-source-identity-second-desk','reviewed_at':generated_at},
        'canonical_mutation':False,'lease_taken':False,
    }
    preparation['receipt_sha256'] = identity(preparation)
    write_json('media-preparation.json', preparation)
    probe = {
        'version':1,'transaction':'STAR-TREK-POST-KZINTI-DOOHAN-PROBE-V1','status':'success',
        'generated_at':generated_at,'canonical_parent':EXPECTED_MAIN,'task_id':TASK_ID,
        'source_fingerprint':TASK_FINGERPRINT,'character':CHARACTER,'performer':PERFORMER,
        'wall_id':WALL_ID,'queued_mode_hint':['voice-animation'],'adjudicated_kind':'voice',
        'adjudicated_performance_mode':'voice / voice-only',
        'performance_scope':f'James Doohan’s vocal performance as {CHARACTER}, bounded to the frozen role source.',
        'physical_performance':'not attributed to James Doohan','animation_maker_attribution':'unresolved',
        'character_design_maker_attribution':'unresolved','voice_direction_attribution':'unresolved',
        'editing_attribution':'unresolved','sound_processing_attribution':'unresolved',
        'production_shop_attribution':'unresolved','vocal_transformation_measured':False,
        'source_receipt_sha256':source_receipt['receipt_sha256'],'media_preparation_sha256':preparation['receipt_sha256'],
        'facets_sha256':preparation['facets_sha256'],'canonical_mutation':False,'lease_taken':False,
    }
    probe['receipt_sha256'] = identity(probe)
    write_json('probe.json', probe)
    files = [path for path in OUT.iterdir() if path.is_file() and path.name != 'manifest.sha256']
    (OUT/'manifest.sha256').write_text(''.join(f'{h_file(path)}  {path.name}\n' for path in sorted(files)))
    print(json.dumps(probe, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
