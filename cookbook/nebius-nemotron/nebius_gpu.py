"""Spawn a Nebius B200/B300, serve the fine-tuned Nemotron 3.5 Transcribe (and, with --bolt, Nemotron 3.5 Bolt
as a chat LLM) as HTTP APIs, and tear it down.

  python cookbook/nebius-nemotron/nebius_gpu.py up [--gpu b200|b300] [--model v4-mid|v4-mid-fp8] [--on-demand] [--bolt]
                                                    [--idle-minutes 60]
  python cookbook/nebius-nemotron/nebius_gpu.py transcribe a.m4a b.wav --out transcripts/
  python cookbook/nebius-nemotron/nebius_gpu.py status | tunnel | ssh | logs | down

`up` creates the VM, bootstraps it (remote/bootstrap.sh, remote/bolt.sh), waits until the APIs answer and opens
an SSH tunnel: STT at http://127.0.0.1:8000, with --bolt also Bolt (OpenAI chat API) at http://127.0.0.1:8001/v1.
`down` saves the compiled-kernel cache, deletes the VM with its boot disk
and verifies that nothing is left. State lives in .state/nebius-nemotron.json (one instance at a time).
Needs: ~/.nebius/bin/nebius logged in, ~/.ssh/id_ed25519_nebius, .state/nemotron-ft/run-token (R2 gateway).
Optional: .state/tailscale-authkey; the VM then joins the tailnet as <name> and serves the API at http://<name>:8000.
"""
import argparse
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request
import uuid

REPO = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
STATE = REPO / '.state/nebius-nemotron.json'
KNOWN_HOSTS = REPO / '.state/nebius-nemotron-known_hosts'
CACHE_DIR = REPO / '.state/nebius-nemotron-kernel-cache'
TOKEN = REPO / '.state/nemotron-ft/run-token'
TS_KEY = REPO / '.state/tailscale-authkey'  # optional; when present the VM joins the tailnet
NEBIUS = os.path.expanduser('~/.nebius/bin/nebius')
KEY = os.path.expanduser('~/.ssh/id_ed25519_nebius')
REMOTE = '/workspace/nemotron-ft'
PORT = 8000
BOLT_PORT = 8001
# Single-GPU presets and the region that offers them (checked 2026-10-30: us-north1 has only B300).
GPUS = {'b200': ('gpu-b200-sxm', '1gpu-20vcpu-224gb', 'us-central1'),
        'b300': ('gpu-b300-sxm', '1gpu-24vcpu-346gb', 'us-north1')}
IMAGE_FAMILY = 'ubuntu24.04-cuda13.0'


def nebius(*args, timeout=120):
    try:
        r = subprocess.run([NEBIUS, *args, '--format', 'json'], capture_output=True, text=True,
                           stdin=subprocess.DEVNULL, timeout=timeout)
    except subprocess.TimeoutExpired:
        sys.exit(f'nebius {args[0]} timed out: the CLI token has probably expired. Run '
                 f'`{NEBIUS} iam whoami` in a terminal, finish the browser login, then retry.')
    if r.returncode:
        raise RuntimeError(f'nebius {" ".join(args[:3])} failed: {r.stderr.strip()[-1500:]}')
    return json.loads(r.stdout) if r.stdout.strip() else {}


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else None


def save_state(state):
    STATE.parent.mkdir(exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2))


def ssh_cmd(ip, *extra):
    return ['ssh', '-i', KEY, '-o', f'UserKnownHostsFile={KNOWN_HOSTS}', '-o', 'StrictHostKeyChecking=accept-new',
            '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=30', '-o', 'LogLevel=ERROR', *extra, f'ubuntu@{ip}']


def ssh(ip, command, check=True, **kw):
    return subprocess.run(ssh_cmd(ip) + [command], check=check, text=True, **kw)


def scp(ip, sources, dest):
    subprocess.run(['scp', '-q', '-i', KEY, '-o', f'UserKnownHostsFile={KNOWN_HOSTS}', '-o', 'LogLevel=ERROR',
                    *map(str, sources), f'ubuntu@{ip}:{dest}'], check=True)


def project_for(region):
    tenant = nebius('iam', 'whoami')['user_profile']['tenants'][0]['tenant_id']
    for p in nebius('iam', 'v2', 'project', 'list', '--parent-id', tenant).get('items', []):
        if region in (p.get('spec', {}).get('region'), p.get('status', {}).get('region')):
            return p['metadata']['id']
    sys.exit(f'no project in region {region}')


def health(timeout=5):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=timeout) as r:
            return json.loads(r.read())
    except Exception:
        return None


def bolt_health(timeout=5):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{BOLT_PORT}/v1/models', timeout=timeout) as r:
            return [m['id'] for m in json.loads(r.read())['data']]
    except Exception:
        return None


def open_tunnel(state):
    if health() and (not state.get('bolt') or bolt_health()):
        return
    close_tunnel(state)
    forwards = [f'-L{port}:127.0.0.1:{port}' for port in [PORT] + ([BOLT_PORT] if state.get('bolt') else [])]
    p = subprocess.Popen(ssh_cmd(state['ip'], '-N', *forwards, '-o', 'ExitOnForwardFailure=yes'),
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True)  # detached: must not hold the caller's output pipe open
    state['tunnel_pid'] = p.pid
    save_state(state)
    for _ in range(20):
        if health():
            return
        time.sleep(1)
    print(f'warning: tunnel to {state["ip"]} opened but /health does not answer yet', file=sys.stderr)


def close_tunnel(state):
    if state.get('tunnel_pid'):
        try:
            os.kill(state['tunnel_pid'], 15)
        except ProcessLookupError:
            pass


def up(args):
    if load_state():
        sys.exit(f'an instance is already recorded in {STATE}; run `status` or `down` first')
    for path in (KEY, KEY + '.pub', TOKEN):
        if not os.path.exists(path):
            sys.exit(f'missing {path}')
    platform, preset, region = GPUS[args.gpu]
    region = args.region or region
    project = project_for(region)
    subnet = nebius('vpc', 'subnet', 'list', '--parent-id', project)['items'][0]['metadata']['id']
    # Public images live in project-<region prefix>public-images, e.g. project-u00public-images.
    image = nebius('compute', 'image', 'get-latest-by-family', '--image-family', IMAGE_FAMILY,
                   '--parent-id', project[:11] + 'public-images')['metadata']['id']
    name = f'nemotron-stt-{args.gpu}-{uuid.uuid4().hex[:6]}'
    cloud_init = ('#cloud-config\nusers:\n  - name: ubuntu\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    shell: /bin/bash\n'
                  f'    ssh_authorized_keys:\n      - {pathlib.Path(KEY + ".pub").read_text().strip()}\n')
    # Preemptible at the spot price by default: Nebius may stop the VM at any time (STOP, never delete).
    pricing = ['--on-demand'] if args.on_demand else ['--follows-spot-price', '--preemptible-on-preemption', 'stop']
    print(f'creating {name}: {platform} {preset} in {region} ({project}), '
          f'{"on-demand" if args.on_demand else "preemptible"}', flush=True)
    inst = nebius('compute', 'instance', 'create', '--parent-id', project, '--name', name, *pricing,
                  '--resources-platform', platform, '--resources-preset', preset,
                  '--boot-disk-managed-disk-name', name + '-boot', '--boot-disk-managed-disk-type', 'network_ssd',
                  '--boot-disk-managed-disk-size-gibibytes', '400', '--boot-disk-managed-disk-source-image-id', image,
                  '--boot-disk-attach-mode', 'READ_WRITE', '--network-interfaces',
                  json.dumps([{'name': 'eth0', 'ip_address': {}, 'public_ip_address': {}, 'subnet_id': subnet}]),
                  '--cloud-init-user-data', cloud_init, timeout=600)
    ip = inst['status']['network_interfaces'][0]['public_ip_address']['address'].split('/')[0]
    state = {'id': inst['metadata']['id'], 'name': name, 'project': project, 'region': region, 'gpu': args.gpu,
             'ip': ip, 'model': args.model, 'bolt': args.bolt, 'preemptible': not args.on_demand, 'created': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    save_state(state)
    print(f'instance {state["id"]} at {ip} (billing has started; `down` deletes it)', flush=True)

    for _ in range(60):
        if ssh(ip, 'true', check=False, stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(10)
    ssh(ip, f'sudo mkdir -p {REMOTE} && sudo chown -R ubuntu /workspace')
    files = [HERE / 'remote/bootstrap.sh', HERE / 'remote/server.py', HERE / 'remote/bolt.sh',
             HERE / 'remote/fetch_best.py']
    cache = CACHE_DIR / f'{args.gpu}.tar'
    scp(ip, files + ([cache] if cache.exists() else []), REMOTE + '/')
    if cache.exists():
        ssh(ip, f'mv {REMOTE}/{cache.name} {REMOTE}/kernel-cache.tar')
    for secret, remote_name in ((TOKEN, 'run-token'), (TS_KEY, 'tailscale-authkey')):
        if secret.exists():  # over stdin, so secrets never appear in a command line
            with secret.open() as f:
                subprocess.run(ssh_cmd(ip) + [f'umask 077; cat > {REMOTE}/{remote_name}'], stdin=f, check=True)
    ssh(ip, f'cd {REMOTE} && chmod +x bootstrap.sh bolt.sh && MODEL_NAME={args.model} BOLT={int(args.bolt)} '
            f'IDLE_MINUTES={args.idle_minutes} '
            f'TS_HOSTNAME={name} nohup ./bootstrap.sh > bootstrap.log 2>&1 &')
    print('bootstrapping: environment + model download (~6 min), then model load and warm-up '
          f'({"cached kernels" if cache.exists() else "first run on this GPU type compiles kernels, +5-10 min"})'
          + ('; then Bolt (48 GB download in parallel, ~5 min load)' if args.bolt else ''),
          flush=True)
    started = time.time()
    while True:
        time.sleep(30)
        r = ssh(ip, f'cd {REMOTE}; cat FAILED 2>/dev/null && echo FAILED; test -f READY && echo READY; '
                    'ls ENV_READY MODEL_READY 2>/dev/null | tr "\\n" " "', check=False, capture_output=True)
        out = r.stdout.strip()
        print(f'  {int(time.time() - started)}s: {out or "working"}', flush=True)
        if 'FAILED' in out:
            sys.exit(f'bootstrap failed; inspect with `{sys.argv[0]} logs`, then `down`')
        if 'READY' in out.split():
            break
    open_tunnel(state)
    print(f'API ready at http://127.0.0.1:{PORT} ({health()})')
    if args.bolt:
        print(f'Bolt ready at http://127.0.0.1:{BOLT_PORT}/v1 ({bolt_health()})')
    if TS_KEY.exists():
        print(f'and on the tailnet at http://{name}:{PORT}' + (f' and :{BOLT_PORT}' if args.bolt else ''))


def status(args):
    state = load_state()
    if not state:
        print('no instance recorded')
        return
    try:
        inst = nebius('compute', 'instance', 'get', '--id', state['id'])
        state['state'] = inst['status'].get('state')
    except RuntimeError as e:
        state['state'] = f'not found ({e})'
    state['health'] = health()
    if state.get('bolt'):
        state['bolt_health'] = bolt_health()
    print(json.dumps(state, indent=2))


def tunnel(args):
    state = load_state() or sys.exit('no instance recorded')
    open_tunnel(state)
    print(health(), bolt_health() if state.get('bolt') else '')


def transcribe(args):
    import mimetypes
    if not health():
        tunnel(args)
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for path in map(pathlib.Path, args.files):
        boundary = uuid.uuid4().hex
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
                f'Content-Type: {mimetypes.guess_type(path.name)[0] or "application/octet-stream"}\r\n\r\n').encode()
        body += path.read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
        req = urllib.request.Request(f'http://127.0.0.1:{PORT}/v1/audio/transcriptions', data=body,
                                     headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
        with urllib.request.urlopen(req, timeout=3600) as r:
            result = json.loads(r.read())
        (out / f'{path.stem}.txt').write_text(result['text'] + '\n')
        (out / f'{path.stem}.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
        flags = sum(s['loop_cleaned'] or s['truncated'] for s in result['segments'])
        print(f'{path.name}: {result["duration"]:.0f}s audio in {result["processing_seconds"]}s, '
              f'{len(result["segments"])} segments, {flags} flagged -> {out / (path.stem + ".txt")}')


def logs(args):
    state = load_state() or sys.exit('no instance recorded')
    ssh(state['ip'], f'cd {REMOTE}; tail -n 5 bootstrap.log env.log fetch.log; tail -n 40 server.log; '
                     'test -f bolt-serve.log && sudo docker logs --tail 40 bolt', check=False)


def down(args):
    state = load_state() or sys.exit('no instance recorded')
    close_tunnel(state)
    cache = CACHE_DIR / f'{state["gpu"]}.tar'
    if not cache.exists():  # keep compiled kernels so the next `up` on this GPU type skips compilation
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with cache.open('wb') as f:
            r = subprocess.run(ssh_cmd(state['ip']) + ['cd ~ && tar -cf - .cache/flashinfer .cache/vllm 2>/dev/null'],
                               stdout=f, timeout=600)
        if r.returncode or cache.stat().st_size < 1 << 20:
            cache.unlink()
        else:
            print(f'saved kernel cache {cache} ({cache.stat().st_size >> 20} MB)')
    # Leave the tailnet first so the node does not linger in the admin console.
    ssh(state['ip'], 'command -v tailscale >/dev/null && sudo tailscale logout', check=False,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f'deleting {state["id"]} ({state["name"]})', flush=True)
    nebius('compute', 'instance', 'delete', '--id', state['id'], timeout=900)
    instances = nebius('compute', 'instance', 'list', '--parent-id', state['project']).get('items', [])
    disks = nebius('compute', 'disk', 'list', '--parent-id', state['project']).get('items', [])
    left = [i['metadata']['name'] for i in instances if i['metadata']['id'] == state['id']] + \
           [d['metadata']['name'] for d in disks if d['metadata']['name'] == state['name'] + '-boot']
    if left:
        sys.exit(f'still present: {left}; state kept in {STATE}')
    STATE.unlink()
    print(f'deleted; no instance or boot disk left in {state["project"]}')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    u = sub.add_parser('up')
    u.add_argument('--gpu', choices=GPUS, default='b200')
    u.add_argument('--region', help='override the default region for the GPU type')
    u.add_argument('--model', default='v4-mid', help='R2 best-<name>/ prefix: v4-mid (BF16) or v4-mid-fp8')
    u.add_argument('--on-demand', action='store_true',
                   help='regular VM that is never preempted (default: preemptible at the spot price)')
    u.add_argument('--bolt', action='store_true',
                   help='also serve Nemotron 3.5 Bolt 74B-A9B (NVFP4) as an OpenAI chat API on port 8001')
    u.add_argument('--idle-minutes', type=float, default=60, help='VM shuts itself down after this idle time; 0 = never')
    t = sub.add_parser('transcribe')
    t.add_argument('files', nargs='+')
    t.add_argument('--out', default='transcripts')
    for name in ('status', 'tunnel', 'logs', 'down'):
        sub.add_parser(name)
    sub.add_parser('ssh')
    args = p.parse_args()
    if args.cmd == 'ssh':
        state = load_state() or sys.exit('no instance recorded')
        os.execvp('ssh', ssh_cmd(state['ip']))
    globals()[args.cmd](args)


if __name__ == '__main__':
    main()
