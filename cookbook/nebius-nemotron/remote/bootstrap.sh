#!/usr/bin/env bash
# Runs on the fresh Nebius VM (Ubuntu 24.04 + CUDA 13.0 image). Builds the inference environment,
# downloads the model from R2 and starts the API. With BOLT=1 it also serves Nemotron 3.5 Bolt on port 8001
# (bolt.sh), sharing the GPU. Idempotent: rerunning skips finished steps.
# Writes READY when /health answers "ok", FAILED (with the step) on any error. Log: bootstrap.log.
set -euo pipefail
R=/workspace/nemotron-ft
MODEL_NAME=${MODEL_NAME:-v4-mid}
BOLT=${BOLT:-0}
# GPU shares: STT weights 67.5 GB (BF16) and Bolt 47.8 GB (NVFP4) on a 183 GB B200; the rest is KV cache.
if [ "$BOLT" = 1 ]; then STT_GPU_UTIL=${STT_GPU_UTIL:-0.47}; else STT_GPU_UTIL=${STT_GPU_UTIL:-0.85}; fi
SPEECH_COMMIT=7b05f096d54db47078fd1569a54d1f3ba4a4c51f  # NeMo Speech revision with the vLLM plugin, as in training
cd $R
rm -f READY FAILED
step=start
trap 'echo "$step $(date -u +%FT%TZ)" > FAILED' ERR
export PATH="$R/infer-venv/bin:$HOME/.local/bin:/usr/local/cuda/bin:$PATH" CUDA_HOME=/usr/local/cuda
export UV_HTTP_TIMEOUT=120 UV_HTTP_RETRIES=5

step=uv
command -v uv >/dev/null || curl --connect-timeout 20 --max-time 120 -LsSf https://astral.sh/uv/install.sh | sh

# Optional: join the tailnet when nebius_gpu.py uploaded an auth key (read from file, never on a command line).
step=tailscale
if [ -f tailscale-authkey ]; then
  command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
  sudo tailscale up --auth-key=file:$R/tailscale-authkey --hostname="${TS_HOSTNAME:-nemotron-stt}"
  rm -f tailscale-authkey
fi

# Environment and model download run in parallel; each ~5 min on a fresh VM.
step=env
(
  if [ ! -f ENV_READY ]; then
    [ -d Speech/.git ] || timeout 600 git clone -q --filter=blob:none https://github.com/NVIDIA-NeMo/Speech.git Speech
    cd Speech && git checkout -q $SPEECH_COMMIT
    UV_PROJECT_ENVIRONMENT=$R/infer-venv UV_PYTHON=3.13 timeout 3600 uv sync --locked --extra asr --extra vllm --no-install-project
    uv pip install --python $R/infer-venv/bin/python --no-deps -e .
    uv pip install --python $R/infer-venv/bin/python --no-deps av==19.0.2
    date -u +%FT%TZ > $R/ENV_READY
  fi
) > env.log 2>&1 &
env_pid=$!
(
  if [ ! -f MODEL_READY ]; then
    BEST_NAME=$MODEL_NAME OUT=$R/model uvx --with requests python fetch_best.py
    date -u +%FT%TZ > $R/MODEL_READY
  fi
) > fetch.log 2>&1 &
fetch_pid=$!
if [ "$BOLT" = 1 ]; then ./bolt.sh fetch > bolt-fetch.log 2>&1 & bolt_pid=$!; fi
step=env; wait $env_pid
step=model; wait $fetch_pid
if [ "$BOLT" = 1 ]; then step=bolt-fetch; wait $bolt_pid; fi

# Compiled FlashInfer/vLLM kernels from an earlier run on the same GPU type (uploaded by nebius_gpu.py).
step=cache
if [ -f kernel-cache.tar ]; then tar -xf kernel-cache.tar -C $HOME && rm kernel-cache.tar; fi

step=server
pkill -f "$R/server.py" || true
[ "$BOLT" = 1 ] && export LLM_PORT=8001
MODEL_DIR=$R/model IDLE_MINUTES=${IDLE_MINUTES:-60} GPU_UTIL=$STT_GPU_UTIL nohup python $R/server.py > server.log 2>&1 &
step=warmup
for _ in $(seq 1 180); do  # up to 30 min: model load plus first-run kernel compilation
  if curl -fs localhost:8000/health | grep -q '"ok"'; then
    # Bolt starts only now: vLLM sizes its KV cache from free memory, so the STT server must hold its share first.
    if [ "$BOLT" = 1 ]; then step=bolt-serve; ./bolt.sh serve > bolt-serve.log 2>&1; fi
    # Publish the API inside the tailnet only (http://<hostname>:8000); no public port is opened.
    if command -v tailscale >/dev/null && tailscale status >/dev/null 2>&1; then
      step=tailscale-serve; sudo tailscale serve --bg --http 8000 http://127.0.0.1:8000
      [ "$BOLT" = 1 ] && sudo tailscale serve --bg --http 8001 http://127.0.0.1:8001
    fi
    date -u +%FT%TZ > READY; exit 0
  fi
  pgrep -f "$R/server.py" >/dev/null || { echo "server exited" >&2; false; }
  sleep 10
done
false
