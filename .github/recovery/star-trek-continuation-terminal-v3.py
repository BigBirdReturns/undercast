from __future__ import annotations

from pathlib import Path
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time

REPOSITORY = os.environ['GITHUB_REPOSITORY']
RUN_ID = int(os.environ['GITHUB_RUN_ID'])
RUN_SHA = os.environ['GITHUB_SHA']
OUT = Path('/tmp/star-trek-continuation-terminal-v3')
RESULT_BRANCH = 'agent/star-trek-continuation-terminal-result-v3'


def fail(message: str) -> None:
    raise RuntimeError(message)


def run(cmd: list[str], *, cwd: Path | None = None, capture: bool = False, check: bool = True) -> str:
    print('+', ' '.join(cmd), flush=True)
    result = subprocess.run(
        cmd,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )
    if capture and result.stderr:
        print(result.stderr, file=sys.stderr, end='')
    if check and result.returncode != 0:
        if capture and result.stdout:
            print(result.stdout, file=sys.stderr, end='')
        fail(f'command failed ({result.returncode}): {cmd}')
    return result.stdout if capture else ''


def gh_json(path: str, *, method: str | None = None, fields: dict[str, str] | None = None) -> dict:
    cmd = ['gh', 'api']
    if method:
        cmd += ['--method', method]
    cmd.append(path)
    for key, value in (fields or {}).items():
        cmd += ['-f', f'{key}={value}']
    return json.loads(run(cmd, capture=True))


def fetch_branch_file(path: str, ref: str) -> dict | None:
    result = subprocess.run(
        ['gh', 'api', f'/repos/{REPOSITORY}/contents/{path}?ref={ref}'],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    if result.returncode != 0:
        return None
    payload = json.loads(result.stdout)
    content = base64.b64decode(payload['content'].replace('\n', '')).decode()
    return json.loads(content)


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def wait_for(path: str, ref: str, *, terminal_statuses: set[str] | None = None, timeout_seconds: int = 86400) -> dict:
    deadline = time.time() + timeout_seconds
    last = None
    while time.time() < deadline:
        value = fetch_branch_file(path, ref)
        if value is not None:
            last = value
            if terminal_statuses is None or value.get('status') in terminal_statuses or value.get('disposition') in terminal_statuses:
                return value
        time.sleep(5)
    fail(f'timed out waiting for {ref}:{path}; last={last}')


def queue_counts(root: Path) -> dict[str, int]:
    state = json.loads((root / 'data/AUTOPILOT.json').read_text())
    jobs = [row for row in state['jobs'] if row.get('scope') == 'star-trek']
    return {
        'total': len(jobs),
        'queued': sum(row.get('status') == 'queued' for row in jobs),
        'resolved': sum(row.get('status') == 'resolved' for row in jobs),
        'rejected': sum(row.get('status') == 'rejected' for row in jobs),
        'blocked': sum(row.get('status') == 'blocked' for row in jobs),
        'in_flight': sum(row.get('status') in {'leased', 'drafted', 'merged'} for row in jobs),
    }


def media_counts(root: Path) -> dict[str, int]:
    audit = json.loads((root / 'data/MEDIA-AUDIT.json').read_text())
    items = [row for row in audit['items'] if row.get('scope') == 'star-trek']
    return {
        'total_facets': len(items),
        'verified': sum(row.get('status') == 'verified' for row in items),
        'review': sum(row.get('status') == 'review' for row in items),
        'attention': sum(row.get('status') in {'attention', 'needs-attention'} for row in items),
        'honest_absences': sum(row.get('status') in {'not-on-file', 'not_on_file', 'absent'} for row in items),
    }


def waterline_counts(root: Path) -> dict[str, int]:
    waterline = json.loads((root / 'data/WATERLINE-STATE.json').read_text())
    cycles = [row for row in waterline['cycles'] if row.get('scope_id') == 'star-trek']
    leases: dict[str, int] = {}
    for row in cycles:
        leases[row['lease_id']] = leases.get(row['lease_id'], 0) + 1
    return {
        'cycles': len(cycles),
        'open': sum(row.get('outcome') not in {'completed', 'aborted'} for row in cycles),
        'duplicate_leases': sum(count > 1 for count in leases.values()),
    }


def run_check(root: Path, args: list[str], log_name: str) -> None:
    result = subprocess.run(args, cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (OUT / 'logs' / log_name).write_text(result.stdout or '')
    if result.returncode != 0:
        fail(f'check failed: {args}; see {log_name}')


def latest_cycle_checker(root: Path, commit: str) -> str:
    paths = run(['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', commit], cwd=root, capture=True).splitlines()
    candidates = [path for path in paths if re.fullmatch(r'scripts/star-trek-.*-cycle\.mjs', path)]
    return candidates[-1] if candidates else 'scripts/star-trek-kzinti-flyer-cycle.mjs'


def exact_pages_run(commit: str) -> dict:
    runs = gh_json(f'/repos/{REPOSITORY}/actions/workflows/pages.yml/runs?per_page=100').get('workflow_runs', [])
    matches = [row for row in runs if row.get('head_sha') == commit and row.get('status') == 'completed' and row.get('conclusion') == 'success']
    if not matches:
        fail(f'no exact successful Pages run for {commit}')
    return sorted(matches, key=lambda row: row.get('created_at', ''))[-1]


def cleanup_refs(result_branch: str) -> dict:
    patterns = [
        'refs/heads/agent/star-trek-lwaxana*',
        'refs/heads/agent/star-trek-kzinti-flyer*',
        'refs/heads/agent/star-trek-post-lwaxana*',
        'refs/heads/agent/star-trek-post-kzinti*',
        'refs/heads/agent/star-trek-continuation-terminal-v2',
        'refs/heads/agent/star-trek-continuation-terminal-v3',
    ]
    before: list[str] = []
    for pattern in patterns:
        output = run(['git', 'ls-remote', '--heads', 'origin', pattern], capture=True)
        for line in output.splitlines():
            if line.strip():
                before.append(line.split('\t', 1)[1].removeprefix('refs/heads/'))
    before = sorted(set(before))
    deleted: list[str] = []
    for branch in before:
        if branch == result_branch:
            continue
        result = subprocess.run(['git', 'push', 'origin', '--delete', branch], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        if result.returncode == 0:
            deleted.append(branch)
    remaining: list[str] = []
    for pattern in patterns:
        output = run(['git', 'ls-remote', '--heads', 'origin', pattern], capture=True)
        for line in output.splitlines():
            if line.strip():
                branch = line.split('\t', 1)[1].removeprefix('refs/heads/')
                if branch != result_branch:
                    remaining.append(branch)
    remaining = sorted(set(remaining))
    if remaining:
        fail(f'temporary refs remain: {remaining}')
    return {'status': 'success', 'enumerated': before, 'deleted': deleted, 'remaining': remaining}


def publish_result(live_commit: str) -> None:
    repo = Path('/tmp/undercast-continuation-fresh-v3')
    run(['git', 'checkout', '-B', RESULT_BRANCH, live_commit], cwd=repo)
    destination = repo / 'transport/star-trek-continuation-terminal-v3'
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    for path in OUT.rglob('*'):
        if path.is_file():
            target = destination / path.relative_to(OUT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
    run(['git', 'config', 'user.name', 'undercast-star-trek-continuation-terminal'], cwd=repo)
    run(['git', 'config', 'user.email', 'star-trek-continuation-terminal@users.noreply.github.com'], cwd=repo)
    paths = [str(path.relative_to(repo)) for path in sorted(destination.rglob('*')) if path.is_file()]
    run(['git', 'add', '--', *paths], cwd=repo)
    status = json.loads((OUT / 'terminal.json').read_text())['status']
    run(['git', 'commit', '-m', f'Star Trek: publish structured continuation terminal {status}'], cwd=repo)
    run(['git', 'push', '--force', 'origin', f'HEAD:refs/heads/{RESULT_BRANCH}'], cwd=repo)


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / 'receipts').mkdir(parents=True)
    (OUT / 'logs').mkdir(parents=True)

    pipeline = wait_for(
        'transport/kzinti-flyer-pipeline-monitor-v1/status.json',
        'agent/star-trek-kzinti-flyer-pipeline-status-v1',
        terminal_statuses={'complete', 'terminal-failure', 'publication-failure', 'candidate-failure', 'timed-out'},
    )
    write_json(OUT / 'pipeline-status.json', pipeline)
    disposition = pipeline.get('disposition')
    if disposition != 'complete':
        live = gh_json(f'/repos/{REPOSITORY}/commits/main')
        terminal = {
            'version': 1,
            'transaction': 'STAR-TREK-CONTINUATION-TERMINAL-V3',
            'status': 'failure',
            'reason': f'Kzinti bounded pipeline ended at {disposition}: {pipeline.get("reason", "")}',
            'workflow_run': RUN_ID,
            'verification_head': RUN_SHA,
            'live_main': live['sha'],
        }
        write_json(OUT / 'terminal.json', terminal)
        # Preserve the failure package without claiming a successful cleanup.
        repo = Path('/tmp/undercast-continuation-fresh-v3')
        run(['git', 'clone', '--filter=blob:none', f'https://x-access-token:{os.environ["GH_TOKEN"]}@github.com/{REPOSITORY}.git', str(repo)])
        publish_result(live['sha'])
        return

    lwaxana = wait_for(
        'transport/lwaxana-rejection-terminal-v1/terminal.json',
        'agent/star-trek-lwaxana-rejection-terminal-result-v1',
        terminal_statuses={'success'},
    )
    kzinti = wait_for(
        'transport/kzinti-flyer-terminal-v1/terminal.json',
        'agent/star-trek-kzinti-flyer-terminal-result-v1',
        terminal_statuses={'success'},
    )
    post_probe = wait_for(
        'transport/post-kzinti-doohan-probe-v1/locator.json',
        'agent/star-trek-post-kzinti-doohan-probe-result-v1',
        terminal_statuses={'success', 'boundary'},
    )
    post_result = wait_for(
        'transport/post-kzinti-continuation-v1/result.json',
        'agent/star-trek-post-kzinti-continuation-result-v1',
        terminal_statuses={'boundary', 'completed'},
    )
    write_json(OUT / 'receipts/lwaxana-terminal.json', lwaxana)
    write_json(OUT / 'receipts/kzinti-terminal.json', kzinti)
    write_json(OUT / 'receipts/post-kzinti-probe.json', post_probe)
    write_json(OUT / 'receipts/post-kzinti-continuation.json', post_result)

    live = gh_json(f'/repos/{REPOSITORY}/commits/main')
    live_sha = live['sha']
    live_tree = live['commit']['tree']['sha']
    live_message = live['commit']['message']
    parents = live.get('parents', [])
    if len(parents) != 1:
        fail(f'live product parent cardinality drifted: {parents}')
    live_parent = parents[0]['sha']
    kzinti_commit = kzinti['product']['commit']
    continuation_status = post_result['status']
    boundary_reason = ''
    if continuation_status == 'boundary':
        if live_sha != kzinti_commit:
            fail(f'boundary live main drifted: expected Kzinti {kzinti_commit}, found {live_sha}')
        terminal_kind = 'post-kzinti-boundary'
        boundary_reason = post_result.get('reason', '')
    elif continuation_status == 'completed':
        product = post_result.get('product') or {}
        if live_sha != product.get('commit') or live_tree != product.get('tree') or live_parent != kzinti_commit:
            fail('post-Kzinti product identity or parent drifted')
        terminal_kind = 'post-kzinti-product'
    else:
        fail(f'unexpected post-Kzinti continuation status: {continuation_status}')
    write_json(OUT / 'live-main.json', live)

    repo = Path('/tmp/undercast-continuation-fresh-v3')
    if repo.exists():
        shutil.rmtree(repo)
    run(['git', 'clone', '--filter=blob:none', f'https://x-access-token:{os.environ["GH_TOKEN"]}@github.com/{REPOSITORY}.git', str(repo)])
    run(['git', 'checkout', '--detach', live_sha], cwd=repo)
    run(['npm', 'ci'], cwd=repo)
    latest_checker = latest_cycle_checker(repo, live_sha)
    run_check(repo, ['node', latest_checker], 'latest-product-checker.log')
    run_check(repo, ['node', 'scripts/star-trek-kzinti-flyer-cycle.mjs'], 'kzinti-checker.log')
    run_check(repo, ['node', 'scripts/star-trek-lwaxana-eligibility-rejection.mjs'], 'lwaxana-checker.log')
    run_check(repo, ['node', 'scripts/thesis-rails.mjs', 'validate', '--json'], 'thesis-status.log')
    next_result = subprocess.run(['node', 'scripts/thesis-rails.mjs', 'next', '--json'], cwd=repo, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (OUT / 'logs/thesis-next.log').write_text(next_result.stdout or '')
    if next_result.returncode != 0:
        fail('thesis next failed')
    next_obligation = json.loads(next_result.stdout)
    write_json(OUT / 'thesis-next.json', next_obligation)
    run_check(repo, ['node', 'scripts/media-audit.mjs', 'gate', '--scope', 'star-trek'], 'media-gate.log')
    run_check(repo, ['node', 'scripts/waterline.mjs', 'validate'], 'waterline.log')
    run_check(repo, ['node', 'scripts/corpus-ops.mjs', 'validate'], 'corpus.log')
    run_check(repo, ['node', 'scripts/census-adapter.mjs', 'check'], 'adapter.log')
    run_check(repo, ['node', 'scripts/validate.mjs'], 'archive.log')

    queue = queue_counts(repo)
    media = media_counts(repo)
    waterline = waterline_counts(repo)
    if queue['total'] != 2228 or queue['rejected'] < 2 or queue['in_flight'] != 0:
        fail(f'terminal queue drifted: {queue}')
    if media['review'] != 0 or media['attention'] != 0:
        fail(f'terminal media debt remains: {media}')
    if waterline['open'] != 0 or waterline['duplicate_leases'] != 0:
        fail(f'terminal waterline drifted: {waterline}')
    write_json(OUT / 'queue.json', queue)
    write_json(OUT / 'media.json', media)
    write_json(OUT / 'waterline.json', waterline)

    pages = exact_pages_run(live_sha)
    write_json(OUT / 'pages-run.json', pages)
    active = gh_json(f'/repos/{REPOSITORY}/actions/runs?per_page=100').get('workflow_runs', [])
    active_rows = [
        {key: row.get(key) for key in ('id', 'name', 'status', 'head_branch', 'head_sha', 'event', 'created_at')}
        for row in active
        if row.get('status') != 'completed'
    ]
    write_json(OUT / 'active-runs-before-cleanup.json', active_rows)
    relevant_active = [row for row in active_rows if re.match(r'^agent/star-trek-(lwaxana|kzinti-flyer|post-lwaxana|post-kzinti|continuation-terminal)', row.get('head_branch') or '')]
    if len(relevant_active) > 1:
        fail(f'more than terminal reconciler remains active: {relevant_active}')

    completed_products = [
        {
            'character': 'Lwaxana Troi',
            'disposition': 'eligibility rejection',
            **{key: lwaxana['product'][key] for key in ('commit', 'tree', 'parent', 'pages_run')},
        },
        {
            'character': 'Kzinti Flyer',
            'disposition': 'canonical card',
            **{key: kzinti['product'][key] for key in ('commit', 'tree', 'parent', 'pages_run')},
        },
    ]
    if continuation_status == 'completed':
        completed_products.append({
            'character': post_result['candidate']['character'],
            'disposition': 'canonical card',
            **{key: post_result['product'][key] for key in ('commit', 'tree')},
            'parent': kzinti_commit,
        })

    terminal = {
        'version': 1,
        'transaction': 'STAR-TREK-CONTINUATION-TERMINAL-V3',
        'status': 'success',
        'terminal_kind': terminal_kind,
        'boundary_reason': boundary_reason or None,
        'workflow_run': RUN_ID,
        'verification_head': RUN_SHA,
        'product': {
            'commit': live_sha,
            'tree': live_tree,
            'parent': live_parent,
            'message': live_message,
            'pages_run': int(pages['id']),
        },
        'completed_products': completed_products,
        'post_kzinti_continuation': continuation_status,
        'queue': queue,
        'media': media,
        'waterline': waterline,
        'next_deterministic_obligation': next_obligation,
        'checks': {
            'fresh_clone': 'pass',
            'latest_product_checker': 'pass',
            'kzinti_checker': 'pass',
            'lwaxana_checker': 'pass',
            'thesis': 'pass',
            'media': 'pass',
            'waterline': 'pass',
            'corpus': 'pass',
            'adapter': 'pass',
            'archive': 'pass',
            'pages': 'success',
            'in_flight_zero': True,
            'media_review_zero': True,
        },
    }
    write_json(OUT / 'terminal.json', terminal)
    report = [
        '# Star Trek continuation terminal reconciliation',
        '',
        f'Status: {terminal["status"]}',
        '',
        f'Live commit: `{live_sha}`',
        '',
        f'Live tree: `{live_tree}`',
        '',
        f'Live parent: `{live_parent}`',
        '',
        f'Live message: {live_message}',
        '',
        f'Post-Kzinti disposition: {continuation_status}',
        '',
        f'Queue: {json.dumps(queue, ensure_ascii=False)}',
        '',
        f'Media: {json.dumps(media, ensure_ascii=False)}',
        '',
        f'Next obligation: {json.dumps(next_obligation, ensure_ascii=False)}',
    ]
    if boundary_reason:
        report += ['', f'Boundary reason: {boundary_reason}']
    (OUT / 'terminal-report.md').write_text('\n'.join(report) + '\n')
    manifest_files = [path for path in OUT.rglob('*') if path.is_file() and path.name != 'manifest.sha256']
    (OUT / 'manifest.sha256').write_text(''.join(f'{sha(path)}  {path.relative_to(OUT)}\n' for path in sorted(manifest_files)))

    publish_result(live_sha)
    cleanup = cleanup_refs(RESULT_BRANCH)
    write_json(OUT / 'cleanup.json', cleanup)
    # Update the result branch once more with the cleanup receipt.
    publish_result(live_sha)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        OUT.mkdir(parents=True, exist_ok=True)
        write_json(OUT / 'terminal-failure.json', {
            'version': 1,
            'transaction': 'STAR-TREK-CONTINUATION-TERMINAL-V3',
            'status': 'failure',
            'error': f'{type(exc).__name__}: {exc}',
            'workflow_run': RUN_ID,
            'verification_head': RUN_SHA,
        })
        raise
