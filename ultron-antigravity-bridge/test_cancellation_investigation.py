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

async def run_cancellation_investigation():
    workspace = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    print("=" * 75, flush=True)
    print("PHASE 5.1: CANCELLATION RECOVERY IN-DEPTH INVESTIGATION", flush=True)
    print(f"Workspace: {workspace}", flush=True)
    print("=" * 75, flush=True)

    mgr = AgentManager()
    mgr.setup(workspace)

    print("\n[Boot] Initializing Persistent Agent and running Warmup...", flush=True)
    t0 = time.perf_counter()
    await mgr.start(auto_warm=True)
    await mgr._warmup_event.wait()
    t1 = time.perf_counter()
    print(f"  -> Agent warmed and READY in {round(t1 - t0, 2)}s. Turn count: {mgr.turn_count}", flush=True)
    print("  -> Waiting 15s to ensure rate limit quota is fully fresh...", flush=True)
    await asyncio.sleep(15.0)

    # -------------------------------------------------------------------------
    # TEST C: BASELINE (Normal completion -> Follow-up)
    # -------------------------------------------------------------------------
    print("\n" + "=" * 75, flush=True)
    print("TEST C: BASELINE (Normal Completion -> Follow-up Question)", flush=True)
    print("=" * 75, flush=True)

    print("\n[Test C - Step 1] Asking normal question: 'What technologies did you use to build Ultron3?'...", flush=True)
    t_c1_start = time.perf_counter()
    t_c1_first = None
    chunks_c1 = []
    async for token in mgr.ask("What technologies did you use to build Ultron3?"):
        if t_c1_first is None:
            t_c1_first = time.perf_counter()
        chunks_c1.append(token)
    t_c1_end = time.perf_counter()
    print(f"  -> Normal Q1 complete: TTFT={t_c1_first - t_c1_start:.2f}s | Total={t_c1_end - t_c1_start:.2f}s", flush=True)

    print("\n[Pacing] Waiting 15s...", flush=True)
    await asyncio.sleep(15.0)

    print("\n[Test C - Step 2] Asking follow-up question: 'Why did you choose Electron for this project?'...", flush=True)
    t_c2_start = time.perf_counter()
    t_c2_first = None
    chunks_c2 = []
    async for token in mgr.ask("Why did you choose Electron for this project?"):
        if t_c2_first is None:
            t_c2_first = time.perf_counter()
        chunks_c2.append(token)
    t_c2_end = time.perf_counter()
    c_recovery_ttft = t_c2_first - t_c2_start
    print(f"  -> Baseline Follow-up complete: TTFT={c_recovery_ttft:.2f}s | Total={t_c2_end - t_c2_start:.2f}s", flush=True)

    print("\n[Pacing] Waiting 15s...", flush=True)
    await asyncio.sleep(15.0)

    # -------------------------------------------------------------------------
    # TEST A: CANCEL DURING THINKING (0.4s after start, before tokens)
    # -------------------------------------------------------------------------
    print("\n" + "=" * 75, flush=True)
    print("TEST A: CANCEL DURING THINKING (0.4s after start, before tokens)", flush=True)
    print("=" * 75, flush=True)

    print("\n[Test A - Step 1] Starting complex question: 'Explain the entire native audio capture pipeline in C#.'...", flush=True)
    
    async def run_and_cancel_early():
        try:
            async for _ in mgr.ask("Explain the entire native audio capture pipeline in C#."):
                pass
        except (asyncio.CancelledError, types.AntigravityCancelledError):
            pass

    task_a = asyncio.create_task(run_and_cancel_early())
    await asyncio.sleep(0.4)
    print("  -> Triggering cancellation during THINKING...", flush=True)
    t_a_trig = time.perf_counter()
    mgr.cancel()
    try:
        await task_a
    except Exception:
        pass
    t_a_idle = time.perf_counter()
    a_halt_duration = t_a_idle - t_a_trig
    print(f"  -> Harness halted and restored IDLE in {a_halt_duration:.2f}s", flush=True)

    print("\n[Test A - Step 2] Sending immediate recovery question: 'What technologies did you use to build Ultron3?'...", flush=True)
    t_a_rec_start = time.perf_counter()
    t_a_rec_first = None
    chunks_a_rec = []
    async for token in mgr.ask("What technologies did you use to build Ultron3?"):
        if t_a_rec_first is None:
            t_a_rec_first = time.perf_counter()
            print(f"  [First Token after Thinking-Cancel in {t_a_rec_first - t_a_rec_start:.2f}s]", flush=True)
        chunks_a_rec.append(token)
    t_a_rec_end = time.perf_counter()
    a_recovery_ttft = (t_a_rec_first - t_a_rec_start) if t_a_rec_first else -1
    print(f"  -> Test A Recovery: TTFT={a_recovery_ttft:.2f}s | Total={t_a_rec_end - t_a_rec_start:.2f}s", flush=True)

    print("\n[Pacing] Waiting 15s...", flush=True)
    await asyncio.sleep(15.0)

    # -------------------------------------------------------------------------
    # TEST B: CANCEL DURING STREAMING (after first 2 text tokens appear)
    # -------------------------------------------------------------------------
    print("\n" + "=" * 75, flush=True)
    print("TEST B: CANCEL DURING STREAMING (after receiving initial tokens)", flush=True)
    print("=" * 75, flush=True)

    print("\n[Test B - Step 1] Starting question: 'How does Ultron3 capture the screen?'...", flush=True)
    t_b_trig = None
    t_b_idle = None

    async def run_and_cancel_during_streaming():
        nonlocal t_b_trig, t_b_idle
        token_count = 0
        gen = mgr.ask("How does Ultron3 capture the screen?")
        try:
            async for _ in gen:
                token_count += 1
                if token_count >= 2:
                    print(f"  -> Received {token_count} tokens. Triggering cancellation during STREAMING...", flush=True)
                    t_b_trig = time.perf_counter()
                    mgr.cancel()
                    break
        except (asyncio.CancelledError, types.AntigravityCancelledError):
            pass
        finally:
            await gen.aclose()

    await run_and_cancel_during_streaming()
    if mgr._agent and hasattr(mgr._agent, "conversation"):
        await mgr._agent.conversation.wait_for_idle()
    t_b_idle = time.perf_counter()
    b_halt_duration = (t_b_idle - t_b_trig) if t_b_trig else 0
    print(f"  -> Harness halted and restored IDLE in {b_halt_duration:.2f}s", flush=True)

    print("\n[Test B - Step 2] Sending immediate recovery question: 'Why did you choose Electron for this project?'...", flush=True)
    t_b_rec_start = time.perf_counter()
    t_b_rec_first = None
    chunks_b_rec = []
    async for token in mgr.ask("Why did you choose Electron for this project?"):
        if t_b_rec_first is None:
            t_b_rec_first = time.perf_counter()
            print(f"  [First Token after Streaming-Cancel in {t_b_rec_first - t_b_rec_start:.2f}s]", flush=True)
        chunks_b_rec.append(token)
    t_b_rec_end = time.perf_counter()
    b_recovery_ttft = (t_b_rec_first - t_b_rec_start) if t_b_rec_first else -1
    print(f"  -> Test B Recovery: TTFT={b_recovery_ttft:.2f}s | Total={t_b_rec_end - t_b_rec_start:.2f}s", flush=True)

    # -------------------------------------------------------------------------
    # SUMMARY
    # -------------------------------------------------------------------------
    await mgr.stop()

    print("\n" + "=" * 75, flush=True)
    print("PHASE 5.1 CANCELLATION INVESTIGATION RESULTS")
    print("=" * 75, flush=True)
    print(f"{'Scenario':<35} | {'Halt Time':<12} | {'Recovery TTFT':<15} | {'Status'}")
    print("-" * 75)
    print(f"{'Test C: Normal Completion Baseline':<35} | {'N/A':<12} | {c_recovery_ttft:>5.2f}s          | Baseline")
    print(f"{'Test A: Cancel During Thinking':<35} | {a_halt_duration:>5.2f}s      | {a_recovery_ttft:>5.2f}s          | {'FAST' if a_recovery_ttft < 3.0 else 'SLOW'}")
    print(f"{'Test B: Cancel During Streaming':<35} | {b_halt_duration:>5.2f}s      | {b_recovery_ttft:>5.2f}s          | {'FAST' if b_recovery_ttft < 3.0 else 'SLOW'}")

if __name__ == "__main__":
    asyncio.run(run_cancellation_investigation())
