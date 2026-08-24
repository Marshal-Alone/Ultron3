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

from google.antigravity import Agent, LocalAgentConfig, types

SYSTEM_INSTRUCTIONS = """You are assisting a candidate during a technical interview.
Use the current workspace as the primary source of truth.
Answer the interviewer's question based on the actual project implementation.
Inspect the source code and documentation when necessary.
Do not invent files, technologies, features, APIs, architecture, or implementation details.
Answer in the first person because the candidate is explaining their own project.
Be conversational, technically accurate, concise, and natural enough for the candidate to say aloud.
Answer the exact question asked.
Prefer concrete implementation details over generic explanations.
If the workspace does not contain enough information to answer confidently, explicitly say that the information cannot be verified from the project rather than hallucinating."""

QUESTIONS = [
    ("Q1", "What technologies did you use to build Ultron3?"),
    ("Q2", "How does Ultron3 capture the screen?"),
    ("Q3", "Why did you choose Electron for this project?")
]

def make_config(workspace: str) -> LocalAgentConfig:
    model_name = os.environ.get("ANTIGRAVITY_MODEL", "gemini-3.5-flash-lite")
    return LocalAgentConfig(
        model=model_name,
        system_instructions=SYSTEM_INSTRUCTIONS,
        workspaces=[workspace],
        capabilities=types.CapabilitiesConfig(
            agent_behavior=types.AgentBehavior.AUTONOMOUS,
            enabled_tools=types.BuiltinTools.read_only(),
            enable_subagents=False,
        )
    )

async def test_startup_profiling(workspace: str):
    print("=" * 75, flush=True)
    print("STEP 1: AGENT STARTUP / INITIALIZATION PROFILE", flush=True)
    print("=" * 75, flush=True)

    config = make_config(workspace)

    t0 = time.perf_counter()
    agent = Agent(config)
    t_obj = time.perf_counter()

    async with agent:
        t_enter = time.perf_counter()
        print(f"Agent object creation: {round((t_obj - t0)*1000, 2)} ms", flush=True)
        print(f"Agent.__aenter__ (localharness spawn + WS handshake): {round((t_enter - t_obj)*1000, 2)} ms ({round(t_enter - t_obj, 3)} s)", flush=True)
        print(f"Conversation ID: {agent.conversation_id}", flush=True)

    t_exit = time.perf_counter()
    print(f"Agent.__aexit__ (WS close + process termination): {round((t_exit - t_enter)*1000, 2)} ms", flush=True)
    return round(t_enter - t_obj, 3)

async def run_pattern_a_ephemeral(workspace: str):
    print("\n" + "=" * 75, flush=True)
    print("STEP 2: PATTERN A - EPHEMERAL (PER-REQUEST) AGENT LIFECYCLE", flush=True)
    print("=" * 75, flush=True)

    results = []

    for q_id, question in QUESTIONS:
        print(f"\n[Pattern A] Asking {q_id}: \"{question}\"...", flush=True)
        config = make_config(workspace)

        t_start = time.perf_counter()
        t_enter = None
        t_first_token = None
        chunks = []
        tool_calls = []

        async with Agent(config) as agent:
            t_enter = time.perf_counter()
            response = await agent.chat(question)

            # Iterate through response and capture tool calls and tokens
            async for chunk in response.chunks:
                if isinstance(chunk, types.ToolCall):
                    tool_calls.append(chunk.name)
                    print(f"  [ToolCall: {chunk.name}]", flush=True)
                elif isinstance(chunk, types.Text):
                    if t_first_token is None:
                        t_first_token = time.perf_counter()
                        print(f"  [First Token in {t_first_token - t_start:.2f}s (chat duration: {t_first_token - t_enter:.2f}s)]", flush=True)
                    chunks.append(chunk.text)

        t_end = time.perf_counter()
        full_text = "".join(chunks)
        ttft = (t_first_token - t_start) if t_first_token else -1
        total_duration = t_end - t_start
        setup_duration = t_enter - t_start if t_enter else 0

        res = {
            "id": q_id,
            "question": question,
            "setup_sec": round(setup_duration, 2),
            "ttft_sec": round(ttft, 2),
            "total_sec": round(total_duration, 2),
            "tool_calls": tool_calls,
            "char_len": len(full_text),
            "preview": full_text[:120].replace("\n", " ") + "..."
        }
        results.append(res)
        print(f"  -> Result: Setup={res['setup_sec']}s | TTFT={res['ttft_sec']}s | Total={res['total_sec']}s | Tools={tool_calls}", flush=True)
        await asyncio.sleep(15.0) # Pacing to respect RPM limit

    return results

async def run_pattern_b_persistent(workspace: str):
    print("\n" + "=" * 75, flush=True)
    print("STEP 3: PATTERN B - PERSISTENT AGENT SESSION LIFECYCLE", flush=True)
    print("=" * 75, flush=True)

    config = make_config(workspace)
    results = []

    t_init_start = time.perf_counter()
    async with Agent(config) as agent:
        t_init_end = time.perf_counter()
        init_sec = round(t_init_end - t_init_start, 2)
        print(f"Persistent Agent initialized once in {init_sec}s. Conversation ID: {agent.conversation_id}", flush=True)

        # 1. Ask Q1, Q2, Q3 in sequence
        for q_id, question in QUESTIONS:
            print(f"\n[Pattern B] Asking {q_id}: \"{question}\" (Turn {agent.conversation.turn_count + 1})...", flush=True)

            t_req_start = time.perf_counter()
            t_first_token = None
            chunks = []
            tool_calls = []

            response = await agent.chat(question)

            async for chunk in response.chunks:
                if isinstance(chunk, types.ToolCall):
                    tool_calls.append(chunk.name)
                    print(f"  [ToolCall: {chunk.name}]", flush=True)
                elif isinstance(chunk, types.Text):
                    if t_first_token is None:
                        t_first_token = time.perf_counter()
                        print(f"  [First Token in {t_first_token - t_req_start:.2f}s]", flush=True)
                    chunks.append(chunk.text)

            t_req_end = time.perf_counter()
            full_text = "".join(chunks)
            ttft = (t_first_token - t_req_start) if t_first_token else -1
            total_duration = t_req_end - t_req_start

            res = {
                "id": q_id,
                "turn": agent.conversation.turn_count,
                "question": question,
                "ttft_sec": round(ttft, 2),
                "total_sec": round(total_duration, 2),
                "tool_calls": tool_calls,
                "char_len": len(full_text),
                "preview": full_text[:120].replace("\n", " ") + "..."
            }
            results.append(res)
            print(f"  -> Result: TTFT={res['ttft_sec']}s | Total={res['total_sec']}s | Tools={tool_calls}", flush=True)
            await asyncio.sleep(15.0) # Pacing between turns to avoid 15 RPM limit

        # 2. Repeat Question 1 (Turn 4) to test workspace memory & caching
        q1_repeat = "What technologies did you use to build Ultron3?"
        print(f"\n[Pattern B] Asking REPEAT Q1: \"{q1_repeat}\" (Turn {agent.conversation.turn_count + 1})...", flush=True)
        t_req_start = time.perf_counter()
        t_first_token = None
        chunks = []
        tool_calls = []

        response = await agent.chat(q1_repeat)
        async for chunk in response.chunks:
            if isinstance(chunk, types.ToolCall):
                tool_calls.append(chunk.name)
                print(f"  [ToolCall: {chunk.name}]", flush=True)
            elif isinstance(chunk, types.Text):
                if t_first_token is None:
                    t_first_token = time.perf_counter()
                    print(f"  [First Token in {t_first_token - t_req_start:.2f}s]", flush=True)
                chunks.append(chunk.text)

        t_req_end = time.perf_counter()
        full_text = "".join(chunks)
        ttft = (t_first_token - t_req_start) if t_first_token else -1
        total_duration = t_req_end - t_req_start

        res_repeat = {
            "id": "Q1-Repeat",
            "turn": agent.conversation.turn_count,
            "question": q1_repeat,
            "ttft_sec": round(ttft, 2),
            "total_sec": round(total_duration, 2),
            "tool_calls": tool_calls,
            "char_len": len(full_text),
            "preview": full_text[:120].replace("\n", " ") + "..."
        }
        results.append(res_repeat)
        print(f"  -> Result (Repeat): TTFT={res_repeat['ttft_sec']}s | Total={res_repeat['total_sec']}s | Tools={tool_calls}", flush=True)

        # 3. Test In-Flight Cancellation & Reusability
        print(f"\n[Pattern B] Testing In-Flight Cancellation on Turn {agent.conversation.turn_count + 1}...", flush=True)
        t_cancel_start = time.perf_counter()
        
        # Start a turn
        resp_to_cancel = await agent.chat("Explain the entire audio pipeline from WASAPI to VAD in detail.")
        
        # Wait a moment for turn to become active
        await asyncio.sleep(0.5)
        
        # Cancel turn via conversation.cancel()
        print("  Triggering agent.conversation.cancel()...", flush=True)
        await agent.conversation.cancel()
        
        # Drain/wait for idle
        await agent.conversation.wait_for_idle()
        t_cancel_done = time.perf_counter()
        print(f"  Turn cancelled and idle restored in {round(t_cancel_done - t_cancel_start, 2)}s. Is Idle: {agent.conversation.is_idle}", flush=True)

        # 4. Immediate Follow-up after Cancellation (Turn recovery)
        print(f"\n[Pattern B] Sending recovery question immediately after cancellation...", flush=True)
        t_rec_start = time.perf_counter()
        t_rec_first_token = None
        rec_chunks = []
        rec_tools = []

        rec_resp = await agent.chat("Why did you choose Electron for this project?")
        async for chunk in rec_resp.chunks:
            if isinstance(chunk, types.ToolCall):
                rec_tools.append(chunk.name)
            elif isinstance(chunk, types.Text):
                if t_rec_first_token is None:
                    t_rec_first_token = time.perf_counter()
                    print(f"  [First Token after cancel recovery in {t_rec_first_token - t_rec_start:.2f}s]", flush=True)
                rec_chunks.append(chunk.text)

        t_rec_end = time.perf_counter()
        rec_text = "".join(rec_chunks)
        print(f"  -> Recovery Result: TTFT={round(t_rec_first_token - t_rec_start, 2)}s | Total={round(t_rec_end - t_rec_start, 2)}s | Success: {len(rec_text) > 0}", flush=True)

    return init_sec, results

async def main():
    workspace = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    print("=" * 75, flush=True)
    print(f"PHASE 4 LATENCY INVESTIGATION & LIFECYCLE BENCHMARK")
    print(f"Workspace: {workspace}")
    print(f"Model: {os.environ.get('ANTIGRAVITY_MODEL', 'gemini-3.5-flash-lite')}")
    print("=" * 75, flush=True)

    startup_time = await test_startup_profiling(workspace)
    await asyncio.sleep(10.0)
    pattern_b_init, pattern_b_results = await run_pattern_b_persistent(workspace)
    await asyncio.sleep(10.0)
    pattern_a_results = await run_pattern_a_ephemeral(workspace)

    summary_payload = {
        "startup_time_sec": startup_time,
        "pattern_a_ephemeral": pattern_a_results,
        "pattern_b_persistent_init_sec": pattern_b_init,
        "pattern_b_persistent": pattern_b_results
    }

    out_file = os.path.join(os.path.dirname(__file__), "phase4_investigation_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(summary_payload, f, indent=2)

    print("\n" + "=" * 75, flush=True)
    print("PHASE 4 BENCHMARK SUMMARY & COMPARISON")
    print("=" * 75, flush=True)
    print(f"{'Question':<15} | {'Pattern A (Ephemeral) TTFT':<26} | {'Pattern B (Persistent) TTFT':<27} | {'Delta':<10}")
    print("-" * 75, flush=True)

    for i in range(3):
        qa = pattern_a_results[i]
        qb = pattern_b_results[i]
        delta = round(qa['ttft_sec'] - qb['ttft_sec'], 2)
        print(f"{qa['id']:<15} | TTFT: {qa['ttft_sec']:>5.2f}s (Total: {qa['total_sec']:>5.2f}s) | TTFT: {qb['ttft_sec']:>5.2f}s (Total: {qb['total_sec']:>5.2f}s) | -{delta}s ({round(delta/qa['ttft_sec']*100, 1)}%)")

    q_rep = pattern_b_results[3]
    print(f"{q_rep['id']:<15} | {'N/A (No Session History)':<26} | TTFT: {q_rep['ttft_sec']:>5.2f}s (Total: {q_rep['total_sec']:>5.2f}s) | Cached Memory")

if __name__ == "__main__":
    asyncio.run(main())
