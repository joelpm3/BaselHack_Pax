#!/usr/bin/env bash
# Nemotron 3.5 Bolt 74B-A9B (NVFP4) as an OpenAI-compatible chat API on 127.0.0.1:8001, next to the STT server.
#   bolt.sh fetch   pull the vLLM image and the weights (runs in parallel with the STT environment)
#   bolt.sh serve   start the container once the STT server holds its GPU share; waits for /health
# NVIDIA publishes no NVFP4 build of the 74B model, so the weights are cloudnathan5's ModelOpt NVFP4 (W4A16 experts,
# FP8 Mamba projections and KV cache), pinned by revision. --trust-remote-code runs the repo's Python files, so
# those are replaced by NVIDIA's own copies from the BF16 repo (also pinned) before anything loads them.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
B=/workspace/bolt
IMAGE=vllm/vllm-openai:cu129-nightly-77154ca6116ae34cbfe314beef1016bde9b63989@sha256:a4c9394a88c97f6e13a6420678c07b544fca2ccbeba2cce5075e48dd965e6341
WEIGHTS=cloudnathan5/NVIDIA-Nemotron-3.5-Bolt-74B-A9B-NVFP4
WEIGHTS_REV=fcf26d4c868500a8e1bacd28b7ec2d1dcb7b2646
CODE=nvidia/NVIDIA-Nemotron-3.5-Bolt-74B-A9B-BF16
CODE_REV=e09a4cedb1787db1760375ee5539f222cae0c672
PORT=${BOLT_PORT:-8001}
GPU_UTIL=${BOLT_GPU_UTIL:-0.45}
mkdir -p $B/cache

fetch() {
  [ -f $B/FETCHED ] && return
  sudo usermod -aG docker ubuntu || true
  sudo docker pull -q $IMAGE &
  local pull=$!
  HF_XET_HIGH_PERFORMANCE=1 timeout 3600 uvx --from 'huggingface_hub[hf_xet]' hf download $WEIGHTS \
    --revision $WEIGHTS_REV --local-dir $B/model --exclude '*.py'
  for f in __init__.py configuration_nemotron_h.py configuration_nemotron_h_omni.py configuration_nemotron_h_puzzle.py \
           configuration_radio.py image_processing_nemotron_h_omni.py modeling_nemotron_h.py modeling_nemotron_h_omni.py \
           modeling_nemotron_h_puzzle.py modeling_radio.py processing_nemotron_h_omni.py ultra_v3_reasoning_parser.py; do
    curl -fsSL --retry 5 -o $B/model/$f https://huggingface.co/$CODE/resolve/$CODE_REV/$f
  done
  wait $pull
  date -u +%FT%TZ > $B/FETCHED
}

serve() {
  sudo docker rm -f bolt >/dev/null 2>&1 || true
  # Latency settings for an interactive advisor: thinking off by default (a request can still pass
  # chat_template_kwargs {"enable_thinking": true}), prefix caching so the long system prompt and the
  # conversation so far are not prefilled again each turn (hybrid Mamba models need mamba-cache-mode align
  # for that), FP8 KV cache, 64k context (the advisor never gets near 256k) so more sequences fit.
  sudo docker run -d --name bolt --gpus all --ipc=host --network host \
    -v $B/model:/model:ro -v $B/cache:/root/.cache -e VLLM_USE_V2_MODEL_RUNNER=1 \
    $IMAGE /model --served-model-name nemotron-3.5-bolt --host 127.0.0.1 --port $PORT \
    --trust-remote-code --tensor-parallel-size 1 --gpu-memory-utilization $GPU_UTIL \
    --max-model-len 65536 --max-num-seqs 32 --enable-chunked-prefill --enable-prefix-caching \
    --kv-cache-dtype fp8 --attention-backend FLASHINFER --mamba-backend flashinfer --mamba-cache-mode align \
    --limit-mm-per-prompt '{"image":4,"video":0}' \
    --enable-auto-tool-choice --tool-call-parser qwen3_coder \
    --reasoning-parser-plugin /model/ultra_v3_reasoning_parser.py --reasoning-parser ultra_v3 \
    --default-chat-template-kwargs '{"enable_thinking": false}' --seed 42 > /dev/null
  for _ in $(seq 1 120); do  # up to 20 min: weights load plus kernel compilation on a fresh cache
    curl -fs localhost:$PORT/health >/dev/null && return 0
    [ "$(sudo docker inspect -f '{{.State.Running}}' bolt)" = true ] || { sudo docker logs --tail 80 bolt >&2; return 1; }
    sleep 10
  done
  return 1
}

"$@"
