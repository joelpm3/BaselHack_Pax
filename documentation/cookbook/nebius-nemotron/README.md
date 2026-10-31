# Cookbook: Nemotron 3.5 Transcribe (Swiss German) + Nemotron 3.5 Bolt on a Nebius B200/B300

One command spawns a single-GPU Nebius VM, installs the inference stack, downloads the fine-tuned
STT model from R2 and serves it as an HTTP API. With `--bolt` it also serves Nemotron 3.5 Bolt
74B-A9B (NVFP4) on the same GPU as an OpenAI-compatible chat API, a self-hosted option for the Pax
advisor's LLM (the app currently uses Claude Sonnet 5.5). A second command deletes the VM again.

Copied from `swiss-german-stt/cookbook/nebius-nemotron` (2026-10-31); `remote/fetch_best.py` comes from
that repo's `training/nemotron/finetune/`. Secrets live in this repo's git-ignored `.state/`.

Model: the fine-tuned Nemotron 3.5 Transcribe **v4-mid** (17.38% held-out ASGDTS WER; see
[RESULTS.md](../../reports/nemotron-finetune-20261028-v1/RESULTS.md)), BF16 by default, or
`--model v4-mid-fp8`. Swiss German speech in, Swiss Standard German text out.

## Prerequisites (on this machine)

- Nebius CLI at `~/.nebius/bin/nebius`, logged in. If the token has expired, the CLI waits for a
  browser login and `nebius_gpu.py` stops after 2 minutes with a hint. Run `~/.nebius/bin/nebius iam whoami`
  in a terminal and finish the login first.
- SSH key `~/.ssh/id_ed25519_nebius` (+ `.pub`).
- Optional: Tailscale auth key in `.state/tailscale-authkey` (mode 600, git-ignored), see API below.
- R2 gateway token `.state/nemotron-ft/run-token` (fetches `best-<model>/` from
  `training/2026-10-28-nemotron-spc07-hoerstudio-v1/`, checksum-verified).

## Use

```bash
python documentation/cookbook/nebius-nemotron/nebius_gpu.py up --gpu b200          # or --gpu b300; --on-demand, --bolt
python documentation/cookbook/nebius-nemotron/nebius_gpu.py transcribe rec1.m4a rec2.wav --out transcripts/
python documentation/cookbook/nebius-nemotron/nebius_gpu.py down
```

`up` prints progress every 30 s and returns when the APIs answer, with an SSH tunnel open to
`http://127.0.0.1:8000` (STT) and, with `--bolt`, `http://127.0.0.1:8001/v1` (Bolt). `status`, `logs`, `ssh` and `tunnel` (reopen the tunnel) help in between.
One instance at a time; its ID and IP are in `.state/nebius-nemotron.json`.

| GPU | Platform / preset | Region (default) |
|---|---|---|
| `b200` | `gpu-b200-sxm` / `1gpu-20vcpu-224gb` | us-central1 |
| `b300` | `gpu-b300-sxm` / `1gpu-24vcpu-346gb` | us-north1 |

As of 2026-10-30, us-north1 offers only B300 and us-central1 offers B200. Override with `--region`.

## API

The server listens on the VM's localhost only and is reached through the SSH tunnel. There is no
public port and no API key.

```bash
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/v1/audio/transcriptions -F file=@rec1.m4a -F response_format=verbose_json
```

**Tailscale (optional):** if `.state/tailscale-authkey` exists, `up` uploads the key over SSH stdin.
The VM joins the tailnet under its instance name (e.g. `nemotron-stt-b200-1a2b3c`), and `tailscale serve`
publishes the API inside the tailnet only, at `http://<name>:8000`. The key is read with
`--auth-key=file:` and deleted after joining, so it never appears in a command line or stays on disk.
`down` runs `tailscale logout` before deleting the VM, so the node doesn't linger in the admin console.

`POST /v1/audio/transcriptions` follows the OpenAI shape (multipart `file`, `response_format` =
`json` | `text` | `verbose_json`, optional `prompt` replacing the default instruction), so OpenAI
clients work with `base_url="http://127.0.0.1:8000/v1"` and any `api_key`. The server accepts any
length and any format PyAV decodes (m4a, mp3, wav, flac, ogg, video containers). It cuts the audio
into segments of at most 30 s at quiet points and decodes all of them in one vLLM batch. `verbose_json`
returns per-segment `start`/`end`/`text`, plus `loop_cleaned` (a runaway repeat was collapsed) and
`truncated` (the 512-token cap was reached).

## Bolt (chat LLM, `--bolt`, not yet run end to end)

`POST http://127.0.0.1:8001/v1/chat/completions`, model `nemotron-3.5-bolt`, OpenAI shape with tool calling
(`qwen3_coder` parser) and JSON-schema structured output. Thinking is off by default for latency; a request
turns it on with `"chat_template_kwargs": {"enable_thinking": true}`. Text and images (JPEG/PNG), no PDF.
The Pax app can point at it with `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL=http://127.0.0.1:8001/v1` and
`LLM_MODEL=nemotron-3.5-bolt`, except document extraction, which sends PDFs that Bolt cannot read.

- Weights: NVIDIA publishes only BF16 (148 GB) and a 24 GB IQ2 build for the 74B model. `bolt.sh` uses
  `cloudnathan5/NVIDIA-Nemotron-3.5-Bolt-74B-A9B-NVFP4` (ModelOpt: NVFP4 W4A16 experts, FP8 Mamba projections,
  47.8 GB), pinned by revision. Its Python files run under `--trust-remote-code`, so `bolt.sh` replaces them
  with NVIDIA's copies from the pinned BF16 repo.
- Runtime: the vLLM nightly image from the model card (`cu129-nightly-77154ca`, pinned by digest) in Docker,
  separate from the STT environment (NeMo Speech lockfile).
- GPU split on a B200 (183 GB): STT 47% (67.5 GB BF16 weights), Bolt 45% (47.8 GB weights + FP8 KV cache).
  Bolt starts after the STT server has taken its share, because vLLM sizes its cache from free memory.
- The idle shutdown counts Bolt requests too (the STT server reads Bolt's `/metrics`).

## Inference settings

- STT: BF16 with MTP2 speculative decoding, ReplaySSM, FlashInfer Mamba backend, 192 sequences, 4,096 batched
  tokens. That is the fastest configuration measured on all 5,750 ASGDTS clips
  (swiss-german-stt `reports/nemotron-finetune-20261028-v1/RESULTS.md`): 1,154× real time vs. 520× plain on a
  B300, same WER. FP8 (`--model v4-mid-fp8`) halves the memory but is slower (937×).
- Bolt: thinking off, prefix caching (with `--mamba-cache-mode align`, required for hybrid Mamba models) so the
  advisor's long static system prompt and the conversation so far are not prefilled again on each turn,
  FP8 KV cache, 64k context, FlashInfer attention and Mamba kernels. No speculative decoding: the DFlash
  drafter NVIDIA ships targets only the 24 GB build on SM120 GPUs, and the checkpoint has no MTP head.

## Timing and cost safety

- VMs are **preemptible** by default (`--follows-spot-price`, `--preemptible-on-preemption stop`): spot price,
  but Nebius may stop the VM at any time. A preempted VM is STOPPED, not deleted; run `down`, then `up` again.
  Use `up --on-demand` when it must not disappear (demo day).

- Fresh VM to ready: about 6 min for the environment and the 67.5 GB model download (run in parallel,
  together with Bolt's 47.8 GB and the ~20 GB vLLM image), then model load and warm-up, then Bolt's load. On the first run for a GPU type, FlashInfer compiles its kernels
  (5–10 min on a B200). `down` saves those kernels to `.state/nebius-nemotron-kernel-cache/<gpu>.tar`
  (~360 MB for a B200) and the next `up` uploads them.
- The VM shuts itself down after `--idle-minutes` (default 60) without a request. That stops GPU
  billing but leaves the instance STOPPED, so still run `down` to delete it and its disk.
- `down` deletes the instance (the managed boot disk goes with it) and checks that neither is
  left in the project.

## Pitfalls already solved here (2026-10-30)

- A plain `pip install vllm` cannot load the checkpoint (`model type nemo_speechlm not recognized`).
  The architecture comes from NeMo Speech's vLLM plugin, so the environment is the Speech lockfile at
  commit `7b05f09` (`uv sync --extra asr --extra vllm`), the same one used for training and evaluation.
- The plugin initialises CUDA in the parent process, so vLLM must start its engine with `spawn`
  (`VLLM_WORKER_MULTIPROC_METHOD=spawn`). Otherwise the engine fails with "CUDA driver initialization failed".
- FlashInfer JIT needs `ninja` and `nvcc` on `PATH`. `bootstrap.sh` puts the venv's `bin` and
  `/usr/local/cuda/bin` first.
