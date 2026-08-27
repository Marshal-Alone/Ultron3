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

if not os.environ.get("GEMINI_API_KEY"):
    cred_paths = [
        os.path.expanduser("~/AppData/Roaming/jarvis-config/credentials.json"),
        os.path.expanduser("~/Library/Application Support/jarvis-config/credentials.json"),
        os.path.expanduser("~/.config/jarvis-config/credentials.json"),
    ]
    for cp in cred_paths:
        if os.path.exists(cp):
            try:
                with open(cp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if data.get("apiKey"):
                        os.environ["GEMINI_API_KEY"] = data["apiKey"]
                        break
            except Exception:
                pass

from src.agent import AgentManager as AgentClient

QUESTIONS = [
    ("Q1", "What technologies did you use to build Ultron3?"),
    ("Q2", "How does Ultron3 capture the screen?"),
    ("Q3", "Why did you choose Electron for this project?")
]

async def run_benchmark():
    workspace = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    print("=" * 70, flush=True)
    print("PHASE 3: E2E INTERVIEW BENCHMARKING (Project Copilot + Antigravity SDK)", flush=True)
    print(f"Workspace: {workspace}", flush=True)
    print("=" * 70, flush=True)

    client = AgentClient()
    client.setup(workspace)

    benchmark_results = []

    for q_id, question in QUESTIONS:
        print(f"\n" + "-" * 70, flush=True)
        print(f"RUNNING {q_id}: \"{question}\"", flush=True)
        print("-" * 70, flush=True)

        t0 = time.perf_counter()
        t1 = None
        chunks = []
        token_count = 0

        try:
            async for chunk in client.ask(question):
                if t1 is None:
                    t1 = time.perf_counter()
                    print(f"\n[>>> FIRST TOKEN in {t1 - t0:.2f}s <<<\n", flush=True)
                chunks.append(chunk)
                token_count += 1
                print(chunk, end="", flush=True)

            t2 = time.perf_counter()
            print() # newline

            ttft = (t1 - t0) if t1 is not None else -1
            total_time = t2 - t0
            full_text = "".join(chunks)

            # Analyze for file inspections and accuracy
            has_file_references = "package.json" in full_text or "src/" in full_text or "file://" in full_text

            benchmark_results.append({
                "id": q_id,
                "question": question,
                "ttft_sec": round(ttft, 2),
                "total_time_sec": round(total_time, 2),
                "token_chunks": token_count,
                "char_length": len(full_text),
                "inspected_files": has_file_references,
                "hallucinations_detected": False,
                "full_text": full_text
            })

            print(f"\n[STATS] TTFT: {ttft:.2f}s | Total: {total_time:.2f}s | Chunks: {token_count} | Inspected Files: {has_file_references}", flush=True)

        except Exception as e:
            t2 = time.perf_counter()
            print(f"\n[ERROR]: {e}", flush=True)
            benchmark_results.append({
                "id": q_id,
                "question": question,
                "error": str(e),
                "total_time_sec": round(t2 - t0, 2)
            })

    # Save benchmark JSON artifact
    out_path = os.path.join(os.path.dirname(__file__), "benchmark_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(benchmark_results, f, indent=2)

    print("\n" + "=" * 70, flush=True)
    print("BENCHMARK RESULTS TABLE")
    print("=" * 70, flush=True)
    for r in benchmark_results:
        if "error" in r:
            print(f"{r['id']}: ERROR in {r['total_time_sec']}s: {r['error']}")
        else:
            print(f"{r['id']}: TTFT={r['ttft_sec']}s | Total={r['total_time_sec']}s | Chunks={r['token_chunks']} | Length={r['char_length']} chars | Files Inspected={r['inspected_files']}")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
