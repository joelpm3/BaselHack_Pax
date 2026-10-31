"""Download an uploaded model (best-<name>/) from R2 and rebuild it with checksums.

Usage: BEST_NAME=v2-final OUT=/workspace/nemotron-ft/merged-v2-final python fetch_best.py
Every object is checked against the SHA-256 stored by publish_best.py; the
reassembled model.safetensors must match the weights manifest.
"""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import threading

import requests

ROOT = Path('/workspace/nemotron-ft')
NAME = os.environ['BEST_NAME']
OUT = Path(os.environ['OUT'])
GATEWAY = 'https://swiss-stt-nemotron-ft-20261028.chuchichaestli.workers.dev/objects/'
PREFIX = f'training/2026-10-28-nemotron-spc07-hoerstudio-v1/best-{NAME}/'
LOCAL = threading.local()


def get(key, sha=None):
    if not hasattr(LOCAL, 'session'):
        LOCAL.session = requests.Session()
        LOCAL.session.headers['Authorization'] = 'Bearer ' + (ROOT / 'run-token').read_text().strip()
    for attempt in range(6):
        try:
            response = LOCAL.session.get(GATEWAY + key, timeout=(20, 300))
            response.raise_for_status()
            data = response.content
            if sha:
                assert hashlib.sha256(data).hexdigest() == sha, f'checksum mismatch {key}'
            return data
        except Exception:
            if attempt == 5:
                raise


def main():
    complete = json.loads(get(PREFIX + 'COMPLETED.json'))
    assert complete['name'] == NAME and not complete.get('dry_run')
    part_dir = OUT.with_name(OUT.name + '.parts')
    part_dir.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for obj in complete['objects']:
        rel = obj['key'][len(PREFIX):]
        if rel.startswith('model/') and rel != 'model/weights-manifest.json':
            target = OUT / rel[len('model/'):]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(get(obj['key'], obj['sha256']))
    manifest = json.loads(get(PREFIX + 'model/weights-manifest.json'))
    assert manifest['sha256'] == complete['weights']['sha256'] and len(manifest['parts']) == complete['weights']['parts']

    def fetch(index):
        part = manifest['parts'][index]
        path = part_dir / f'{index:05d}'
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == part['sha256']:
            return
        path.write_bytes(get(part['key'], part['sha256']))
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(fetch, range(len(manifest['parts']))))
    digest = hashlib.sha256()
    tmp = OUT / 'model.safetensors.tmp'
    with tmp.open('wb') as out:
        for index in range(len(manifest['parts'])):
            data = (part_dir / f'{index:05d}').read_bytes()
            digest.update(data)
            out.write(data)
    assert digest.hexdigest() == manifest['sha256'], 'reassembled weights differ'
    tmp.replace(OUT / 'model.safetensors')
    for path in part_dir.iterdir():
        path.unlink()
    part_dir.rmdir()
    print(f'fetched {NAME}: {manifest["bytes"]} bytes, sha256 {manifest["sha256"]} verified', flush=True)


if __name__ == '__main__':
    main()
