import os
import sys
import time
import json
import asyncio
from dotenv import load_dotenv

BRIDGE_DIR = os.path.dirname(os.path.abspath(__file__))
if BRIDGE_DIR not in sys.path:
    sys.path.insert(0, BRIDGE_DIR)

load_dotenv(os.path.join(BRIDGE_DIR, ".env"))
load_dotenv(os.path.expanduser("~/.env"))

from src.agent import AgentManager
from google.antigravity import types

QUESTIONS = [
    ("Q1", "What technologies did you use to build Ultron3?"),
    ("Q2", "How does Ultron3 capture the screen?"),
    ("Q3", "Why did you choose Electron for this project?")
]

async def run_phase5_benchmark():
    workspace = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    print("=" * 75, flush=True)
    print("PHASE 5 E2E BENCHMARK: PERSISTENT AGENT WITH WORKSPACE WARMUP", flush=True)
    print(f"Workspace: {workspace}", flush=True)
    print(f"Model: {os.environ.get('ANTIGRAVITY_MODEL', 'gemini-3.5-flash-lite')}", flush=True)
    print("=" * 75, flush=True)

    mgr = AgentManager()
    mgr.setup(workspace)

    # 1. Measure Agent Initialization Time
    t_init_start = time.perf_counter()
    print("\n[Stage 1] Initializing persistent Agent...", flush=True)
    await mgr.start(auto_warm=True)
    t_init_end = time.perf_counter()
    init_duration = round(t_init_end - t_init_start, 2)
    print(f"  -> Agent initialized in {init_duration}s. State: {mgr.state}", flush=True)

    # 2. Measure Background Warmup Duration
    print("\n[Stage 2] Awaiting background workspace warmup completion...", flush=True)
    t_warm_start = time.perf_counter()
    await mgr._warmup_event.wait()
    t_warm_end = time.perf_counter()
    warmup_duration = round(t_warm_end - t_warm_start, 2)
    print(f"  -> Warmup complete in {warmup_duration}s. State: {mgr.state}", flush=True)
    print("  -> Waiting 20s to ensure rate limit quota is fully fresh for interview turns...", flush=True)
    await asyncio.sleep(20.0)

    results = []

    # 3. Measure sequential questions (Q1, Q2, Q3) on the warmed persistent Agent
    for q_id, question in QUESTIONS:
        print(f"\n[Stage 3] Asking {q_id}: \"{question}\" (Turn {mgr.turn_count + 1})...", flush=True)
        t_start = time.perf_counter()
        t_first_token = None
        chunks = []

        async for token in mgr.ask(question, request_id=f"bench_{q_id}"):
            if t_first_token is None:
                t_first_token = time.perf_counter()
                print(f"  [First Token in {t_first_token - t_start:.2f}s]", flush=True)
            chunks.append(token)

        t_end = time.perf_counter()
        full_text = "".join(chunks)
        ttft = (t_first_token - t_start) if t_first_token else -1
        total_duration = t_end - t_start

        res = {
            "id": q_id,
            "turn": mgr.turn_count,
            "question": question,
            "ttft_sec": round(ttft, 2),
            "total_sec": round(total_duration, 2),
            "char_len": len(full_text),
            "preview": full_text[:120].replace("\n", " ") + "..."
        }
        results.append(res)
        print(f"  -> Result: TTFT={res['ttft_sec']}s | Total={res['total_sec']}s | Chars={res['char_len']}", flush=True)
        await asyncio.sleep(25.0) # Pacing between turns to respect free-tier 15 RPM

    # 4. Repeat Question 1
    q1_repeat = "What technologies did you use to build Ultron3?"
    print(f"\n[Stage 4] Asking REPEAT Q1: \"{q1_repeat}\" (Turn {mgr.turn_count + 1})...", flush=True)
    t_start = time.perf_counter()
    t_first_token = None
    chunks = []

    async for token in mgr.ask(q1_repeat, request_id="bench_q1_repeat"):
        if t_first_token is None:
            t_first_token = time.perf_counter()
            print(f"  [First Token in {t_first_token - t_start:.2f}s]", flush=True)
        chunks.append(token)

    t_end = time.perf_counter()
    full_text = "".join(chunks)
    ttft = (t_first_token - t_start) if t_first_token else -1
    total_duration = t_end - t_start

    res_repeat = {
        "id": "Q1-Repeat",
        "turn": mgr.turn_count,
        "question": q1_repeat,
        "ttft_sec": round(ttft, 2),
        "total_sec": round(total_duration, 2),
        "char_len": len(full_text),
        "preview": full_text[:120].replace("\n", " ") + "..."
    }
    results.append(res_repeat)
    print(f"  -> Result (Repeat): TTFT={res_repeat['ttft_sec']}s | Total={res_repeat['total_sec']}s", flush=True)
    await asyncio.sleep(25.0)

    # 5. Cancellation and Recovery Test
    print(f"\n[Stage 5] Testing Cancellation & Recovery (Turn {mgr.turn_count + 1})...", flush=True)
    t_cancel_start = time.perf_counter()

    async def long_turn():
        try:
            async for _ in mgr.ask("Explain the entire audio pipeline from WASAPI to VAD in detail."):
                pass
        except asyncio.CancelledError:
            pass

    task = asyncio.create_task(long_turn())
    await asyncio.sleep(0.5)
    print("  Triggering mgr.cancel()...", flush=True)
    mgr.cancel()
    t_cancel_done = time.perf_counter()
    cancel_duration = round(t_cancel_done - t_cancel_start, 2)
    print(f"  -> Turn cancelled in {cancel_duration}s. State: {mgr.state}", flush=True)
    task.cancel()

    # Recovery request immediately after cancel
    print("\n[Stage 6] Immediate recovery question after cancellation...", flush=True)
    t_rec_start = time.perf_counter()
    t_rec_first_token = None
    rec_chunks = []

    async for token in mgr.ask("Why did you choose Electron for this project?", request_id="bench_recovery"):
        if t_rec_first_token is None:
            t_rec_first_token = time.perf_counter()
            print(f"  [First Token after cancel recovery in {t_rec_first_token - t_rec_start:.2f}s]", flush=True)
        rec_chunks.append(token)

    t_rec_end = time.perf_counter()
    rec_text = "".join(rec_chunks)
    rec_ttft = (t_rec_first_token - t_rec_start) if t_rec_first_token else -1
    rec_total = t_rec_end - t_rec_start
    print(f"  -> Recovery Result: TTFT={round(rec_ttft, 2)}s | Total={round(rec_total, 2)}s | Success: {len(rec_text) > 0}", flush=True)

    # Clean shutdown
    await mgr.stop()

    summary = {
        "agent_init_sec": init_duration,
        "warmup_sec": warmup_duration,
        "benchmark_questions": results,
        "cancellation_sec": cancel_duration,
        "recovery_ttft_sec": round(rec_ttft, 2),
        "recovery_total_sec": round(rec_total, 2)
    }

    out_file = os.path.join(os.path.dirname(__file__), "phase5_benchmark_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("\n" + "=" * 75, flush=True)
    print("PHASE 5 BENCHMARK COMPLETE: FINAL COMPARISON TABLE")
    print("=" * 75, flush=True)
    print(f"Agent Init: {init_duration}s | Background Warmup: {warmup_duration}s")
    print("-" * 75, flush=True)
    print(f"{'Question':<15} | {'Phase 4 (Ephemeral) TTFT':<26} | {'Phase 5 (Warmed) TTFT':<23} | {'Delta':<10}")
    print("-" * 75, flush=True)

    p4_benchmarks = {
        "Q1": 11.30,
        "Q2": 14.19,
        "Q3": 19.01,
        "Q1-Repeat": 11.30
    }

    for r in results:
        q_id = r["id"]
        p4_ttft = p4_benchmarks.get(q_id, 11.30)
        p5_ttft = r["ttft_sec"]
        delta = round(p4_ttft - p5_ttft, 2)
        pct = round((delta / p4_ttft) * 100, 1)
        print(f"{q_id:<15} | {p4_ttft:>5.2f}s                     | {p5_ttft:>5.2f}s (Total: {r['total_sec']:>5.2f}s) | -{delta}s ({pct}%)")

    print(f"{'Recovery':<15} | {'N/A':<26} | {rec_ttft:>5.2f}s (Total: {round(rec_total, 2):>5.2f}s) | Post-Cancel")

if __name__ == "__main__":
    asyncio.run(run_phase5_benchmark())
