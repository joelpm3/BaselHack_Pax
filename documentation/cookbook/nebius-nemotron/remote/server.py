"""Swiss German transcription API: fine-tuned Nemotron 3.5 Transcribe on vLLM, OpenAI-style endpoint.

POST /v1/audio/transcriptions  multipart: file=<audio>, optional prompt, response_format=json|text|verbose_json
GET  /health                    {"status": "ok", ...} once the model is loaded

Any length and any format PyAV can decode. Audio is cut into segments of at most 30 s at the quietest
point of each 20-30 s window (as for the Zürich labelling run), all segments are decoded in one vLLM
batch, and runaway repeats are collapsed with the model card's guardrail.
Serving settings are the fastest measured on all 5,750 ASGDTS clips (RESULTS.md in swiss-german-stt: BF16 with
MTP2 speculative decoding, ReplaySSM and the FlashInfer Mamba backend, 1,154x real time on a B300 vs. 520x plain,
same WER). GPU_UTIL is this server's share of the GPU; nebius_gpu.py lowers it when Bolt shares the GPU.
Listens on 127.0.0.1 only; reach it through an SSH tunnel. Shuts the VM down after IDLE_MINUTES
without requests (to this server or, with LLM_PORT set, to the Bolt server) so a forgotten instance stops GPU
billing (STOPPED; delete it with `nebius_gpu.py down`).
"""
import asyncio
import io
import os
import re
import subprocess
import threading
import time
import urllib.request

os.environ.setdefault('VLLM_WORKER_MULTIPROC_METHOD', 'spawn')  # the NeMo plugin initialises CUDA before fork

import av
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
import uvicorn

MODEL = os.environ.get('MODEL_DIR', '/workspace/nemotron-ft/model')
IDLE_MINUTES = float(os.environ.get('IDLE_MINUTES', 60))
GPU_UTIL = float(os.environ.get('GPU_UTIL', 0.85))
LLM_PORT = os.environ.get('LLM_PORT')
SR, MIN_S, MAX_S = 16000, 20, 30
PROMPT = ('Transcribe this Swiss German speech into Swiss Standard German. Preserve the meaning and use Swiss '
          'spelling, punctuation and capitalization. Output only the transcript.')
CHAR_RUN = re.compile(r'(.)\1{20,}', re.DOTALL)
BLOCK_RUN = re.compile(r'(.{1,4096}?)\1{19,}', re.DOTALL)

app = FastAPI(title='Swiss German STT (Nemotron 3.5 Transcribe, fine-tuned)')
state = {'llm': None, 'tokenizer': None, 'last_request': time.time(), 'loaded_at': None}
lock = asyncio.Lock()  # vLLM's offline engine is not re-entrant; one request batch at a time


def cleanup_generation_loops(text):
    text = CHAR_RUN.sub(lambda m: m.group(1), text)
    return BLOCK_RUN.sub(lambda m: m.group(1), text)


def decode(data):
    with av.open(io.BytesIO(data)) as container:
        resampler = av.AudioResampler(format='flt', layout='mono', rate=SR)
        chunks = [f.to_ndarray().reshape(-1) for frame in container.decode(audio=0) for f in resampler.resample(frame)]
        chunks += [f.to_ndarray().reshape(-1) for f in resampler.resample(None)]
    return np.concatenate(chunks) if chunks else np.zeros(0, np.float32)


def segments(audio, frame=1600):
    start = 0
    while len(audio) - start > MAX_S * SR:
        window = audio[start + MIN_S * SR:start + MAX_S * SR]
        energy = (window[:len(window) // frame * frame].reshape(-1, frame) ** 2).mean(axis=1)
        cut = start + MIN_S * SR + int(energy.argmin()) * frame + frame // 2
        yield start, audio[start:cut]
        start = cut
    if len(audio) - start >= SR // 10:
        yield start, audio[start:]


def transcribe(audio, instruction):
    from vllm import SamplingParams
    prompt = state['tokenizer'].apply_chat_template([{'role': 'user', 'content': instruction + ' <|audio|>'}],
                                                    add_generation_prompt=True, tokenize=False, enable_thinking=False)
    parts = list(segments(audio))
    requests = [{'prompt': prompt, 'multi_modal_data': {'audio': (a, SR)}} for _, a in parts]
    out = [o.outputs[0] for o in state['llm'].generate(requests, SamplingParams(temperature=0, max_tokens=512),
                                                       use_tqdm=False)]
    # A segment that hits the token cap is almost always stuck in a loop (cross-talk, laughter, noise):
    # decode it again with a repetition penalty and keep that only if it then ends on its own.
    stuck = [i for i, o in enumerate(out) if o.finish_reason == 'length']
    retried = set()
    if stuck:
        again = state['llm'].generate([requests[i] for i in stuck], SamplingParams(
            temperature=0, max_tokens=512, repetition_penalty=1.15), use_tqdm=False)
        for i, o in zip(stuck, again):
            if o.outputs[0].finish_reason != 'length':
                out[i] = o.outputs[0]
                retried.add(i)
    result = []
    for i, ((start, a), o) in enumerate(zip(parts, out)):
        raw = re.sub(r'<think>.*?</think>', '', o.text, flags=re.DOTALL).strip()
        text = cleanup_generation_loops(raw)
        result.append({'start': round(start / SR, 2), 'end': round((start + len(a)) / SR, 2), 'text': text,
                       'loop_cleaned': text != raw, 'truncated': o.finish_reason == 'length',
                       'repetition_penalty_retry': i in retried})
    return result


def llm_requests():
    """Requests the Bolt server has finished or is running, from its Prometheus metrics; None if unreachable."""
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{LLM_PORT}/metrics', timeout=5) as r:
            lines = r.read().decode().splitlines()
    except Exception:
        return None
    return sum(float(l.rsplit(' ', 1)[1]) for l in lines
               if l.startswith(('vllm:request_success_total', 'vllm:num_requests_running')))


def idle_watchdog():
    seen = None
    while True:
        time.sleep(60)
        if LLM_PORT:
            count = llm_requests()
            if count is not None and count != seen:
                seen = count
                state['last_request'] = time.time()
        if IDLE_MINUTES > 0 and time.time() - state['last_request'] > IDLE_MINUTES * 60:
            print(f'idle for {IDLE_MINUTES} min, shutting the VM down', flush=True)
            subprocess.run(['sudo', 'shutdown', '-h', 'now'])


@app.on_event('startup')
def load():
    from transformers import AutoTokenizer
    from vllm import LLM
    state['tokenizer'] = AutoTokenizer.from_pretrained(MODEL, trust_remote_code=True)
    state['llm'] = LLM(model=MODEL, trust_remote_code=True, dtype='bfloat16', max_model_len=4096, max_num_seqs=192,
                       max_num_batched_tokens=4096, gpu_memory_utilization=GPU_UTIL, limit_mm_per_prompt={'audio': 1},
                       enable_prefix_caching=False, enable_chunked_prefill=True, mamba_cache_mode='none',
                       speculative_config={'method': 'mtp', 'num_speculative_tokens': 2},
                       use_replayssm=True, mamba_backend='flashinfer', seed=20260922)
    transcribe(np.zeros(SR, np.float32), PROMPT)  # warm-up: kernel compilation happens here, not in a request
    state['loaded_at'] = time.time()
    state['last_request'] = time.time()
    threading.Thread(target=idle_watchdog, daemon=True).start()


@app.get('/health')
def health():
    import torch
    return {'status': 'ok' if state['loaded_at'] else 'loading', 'model': MODEL, 'gpu': torch.cuda.get_device_name(0),
            'idle_shutdown_minutes': IDLE_MINUTES, 'idle_seconds': round(time.time() - state['last_request'])}


@app.post('/v1/audio/transcriptions')
async def transcriptions(file: UploadFile = File(...), prompt: str = Form(None),
                         response_format: str = Form('json'), model: str = Form(None)):
    if not state['loaded_at']:
        raise HTTPException(503, 'model is still loading')
    state['last_request'] = time.time()
    try:
        audio = decode(await file.read())
    except Exception as e:
        raise HTTPException(400, f'could not decode audio: {e}')
    started = time.perf_counter()
    async with lock:
        segs = await asyncio.to_thread(transcribe, audio, prompt or PROMPT)
    state['last_request'] = time.time()
    text = ' '.join(s['text'] for s in segs if s['text'])
    if response_format == 'text':
        return PlainTextResponse(text + '\n')
    if response_format == 'verbose_json':
        return {'text': text, 'duration': round(len(audio) / SR, 2), 'segments': segs,
                'processing_seconds': round(time.perf_counter() - started, 2)}
    return {'text': text}


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=int(os.environ.get('PORT', 8000)))
