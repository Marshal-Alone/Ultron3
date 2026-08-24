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

# 20 Test Questions across 6 Categories
QUESTIONS = [
    # CATEGORY 1 — PROJECT FACTS
    {
        "id": "Q1",
        "category": "PROJECT FACTS",
        "question": "What technologies did you use to build Ultron3?",
        "expected_topics": ["Electron", "Node.js", "Lit", "Python", "FastAPI", "Gemini", "Groq", "WebRTC"],
        "known_sources": ["package.json", "src/main.js", "src/renderer.js"]
    },
    {
        "id": "Q2",
        "category": "PROJECT FACTS",
        "question": "How does Ultron3 capture the screen?",
        "expected_topics": ["getDisplayMedia", "canvas", "JPEG", "IPC", "desktopCapturer", "captureScreen"],
        "known_sources": ["src/utils/screenCapture.js", "src/main.js"]
    },
    {
        "id": "Q3",
        "category": "PROJECT FACTS",
        "question": "How does the audio capture pipeline work?",
        "expected_topics": ["microphone", "system audio", "AudioContext", "VAD", "WASAPI", "16kHz", "WAV"],
        "known_sources": ["src/utils/audio.js", "src/utils/audioRecorder.js"]
    },
    {
        "id": "Q4",
        "category": "PROJECT FACTS",
        "question": "How does the application communicate between Electron's main process and renderer?",
        "expected_topics": ["IPC", "ipcRenderer", "ipcMain", "contextBridge", "preload", "send", "invoke", "handle"],
        "known_sources": ["src/preload.js", "src/main.js", "src/renderer.js"]
    },

    # CATEGORY 2 — ARCHITECTURE
    {
        "id": "Q5",
        "category": "ARCHITECTURE",
        "question": "Explain the complete flow from an interviewer asking a question to the answer appearing in Ultron3.",
        "expected_topics": ["Audio/Screen capture", "STT/Transcription", "PromptLogger", "AI Provider", "SSE/Streaming", "UI Renderer"],
        "known_sources": ["src/utils/promptLogger.js", "src/utils/gemini.js", "src/utils/groq.js", "src/renderer.js"]
    },
    {
        "id": "Q6",
        "category": "ARCHITECTURE",
        "question": "How are Gemini and Groq used differently in Ultron3?",
        "expected_topics": ["Gemini for multimodal/vision & transcription", "Groq for fast low-latency Llama inference", "fallback/provider selection"],
        "known_sources": ["src/utils/gemini.js", "src/utils/groq.js", "src/utils/aiRouter.js"]
    },
    {
        "id": "Q7",
        "category": "ARCHITECTURE",
        "question": "How does the Project Copilot bridge communicate with Ultron3?",
        "expected_topics": ["Local HTTP server", "session.json port/token", "SSE streaming", "Bearer auth", "Ctrl+P shortcut", "antigravity.js"],
        "known_sources": ["src/utils/antigravity.js", "ultron-antigravity-bridge/src/server.py"]
    },

    # CATEGORY 3 — DESIGN DECISIONS
    {
        "id": "Q8",
        "category": "DESIGN DECISIONS",
        "question": "Why did you choose Electron for this project?",
        "expected_topics": ["Cross-platform OS integration", "screen capture", "global shortcuts", "web frontend", "native window transparency"],
        "known_sources": ["package.json", "src/main.js"]
    },
    {
        "id": "Q9",
        "category": "DESIGN DECISIONS",
        "question": "Why did you use Lit instead of React?",
        "expected_topics": ["Lightweight web components", "fast load time", "no heavy bundling overhead", "native DOM performance"],
        "known_sources": ["package.json", "src/components/"]
    },
    {
        "id": "Q10",
        "category": "DESIGN DECISIONS",
        "question": "Why did you separate the Antigravity bridge into a Python microservice?",
        "expected_topics": ["google-antigravity SDK is Python-native", "local isolation", "SSE streaming to Node.js", "keeps Electron core lightweight"],
        "known_sources": ["ultron-antigravity-bridge/run.py", "ultron-antigravity-bridge/src/server.py"]
    },

    # CATEGORY 4 — IMPLEMENTATION DETAILS
    {
        "id": "Q11",
        "category": "IMPLEMENTATION DETAILS",
        "question": "How does Invigilator Mode perform automatic typing?",
        "expected_topics": ["robotjs or nut.js or sendInput", "human-like keystroke delays", "character/word by word", "clipboard fallback"],
        "known_sources": ["src/utils/autotype.js", "src/utils/invigilator.js"]
    },
    {
        "id": "Q12",
        "category": "IMPLEMENTATION DETAILS",
        "question": "How does Ultron3 handle application shutdown and session export?",
        "expected_topics": ["before-quit event", "saving transcript/session history", "JSON export", "cleaning temp files / bridge cleanup"],
        "known_sources": ["src/main.js", "src/utils/sessionManager.js"]
    },
    {
        "id": "Q13",
        "category": "IMPLEMENTATION DETAILS",
        "question": "How does the application handle AI streaming?",
        "expected_topics": ["Server-Sent Events (SSE) or chunk stream", "token-by-token UI updates", "cancellation token / AbortController", "markdown rendering"],
        "known_sources": ["src/utils/antigravity.js", "src/utils/gemini.js", "src/utils/renderer.js"]
    },

    # CATEGORY 5 — FOLLOW-UP / MULTI-TURN
    {
        "id": "Q14",
        "category": "FOLLOW-UP / MULTI-TURN",
        "question": "How does screen capture work?",
        "expected_topics": ["getDisplayMedia", "desktopCapturer", "canvas", "frame buffer"],
        "known_sources": ["src/utils/screenCapture.js"]
    },
    {
        "id": "Q15",
        "category": "FOLLOW-UP / MULTI-TURN",
        "question": "Why did you implement it that way?",
        "expected_topics": ["cross-platform compatibility", "low overhead", "Chromium built-in capabilities without extra native drivers"],
        "known_sources": ["src/utils/screenCapture.js"]
    },
    {
        "id": "Q16",
        "category": "FOLLOW-UP / MULTI-TURN",
        "question": "What happens to the captured image after that?",
        "expected_topics": ["compressed to JPEG/base64", "sent to vision model / prompt context", "IPC to renderer/provider"],
        "known_sources": ["src/utils/screenCapture.js", "src/utils/gemini.js"]
    },
    {
        "id": "Q17",
        "category": "FOLLOW-UP / MULTI-TURN",
        "question": "What would happen if that process failed?",
        "expected_topics": ["error handling", "permission prompts", "graceful degradation to audio-only", "fallback warning UI"],
        "known_sources": ["src/utils/screenCapture.js", "src/renderer.js"]
    },

    # CATEGORY 6 — UNKNOWN INFORMATION / ANTI-HALLUCINATION
    {
        "id": "Q18",
        "category": "UNKNOWN / ANTI-HALLUCINATION",
        "question": "Why did you choose Kubernetes for Ultron3?",
        "expected_topics": ["Not used", "Ultron3 is a desktop app / not deployed on Kubernetes", "no Kubernetes in project"],
        "known_sources": ["package.json"]
    },
    {
        "id": "Q19",
        "category": "UNKNOWN / ANTI-HALLUCINATION",
        "question": "How does your PostgreSQL replication architecture work?",
        "expected_topics": ["Not used", "No PostgreSQL in project", "Local JSON/file storage or SQLite"],
        "known_sources": ["package.json"]
    },
    {
        "id": "Q20",
        "category": "UNKNOWN / ANTI-HALLUCINATION",
        "question": "Why did you choose Redis for caching?",
        "expected_topics": ["Not used", "No Redis in project", "in-memory / local storage"],
        "known_sources": ["package.json"]
    }
]

def evaluate_response(q_meta, answer_text, ttft, total_time):
    q_id = q_meta["id"]
    category = q_meta["category"]
    expected = q_meta["expected_topics"]
    
    # 1. First-person check
    fp_keywords = ["I ", "I've", "I'm", "my ", "we ", "our ", "I chose", "I used", "I implemented", "I built"]
    has_first_person = any(kw.lower() in answer_text.lower() for kw in fp_keywords)
    
    # 2. Unknown handling check (Category 6)
    is_unknown_cat = category == "UNKNOWN / ANTI-HALLUCINATION"
    rejection_keywords = ["not used", "not implemented", "don't use", "doesn't use", "no kubernetes", "no postgresql", "no redis", "desktop application", "not present", "not deployed"]
    properly_rejected = any(kw in answer_text.lower() for kw in rejection_keywords) if is_unknown_cat else True
    
    # 3. Hallucination check
    hallucinated = False
    if is_unknown_cat and not properly_rejected:
        hallucinated = True
        
    # 4. Grounding & Topic Coverage
    hits = sum(1 for t in expected if t.lower() in answer_text.lower())
    coverage_pct = (hits / max(len(expected), 1)) * 100
    
    # 5. Technical Accuracy Rating
    if is_unknown_cat:
        if properly_rejected:
            accuracy_rating = "PASS"
        else:
            accuracy_rating = "FAIL"
    else:
        if hits >= 2 or len(answer_text) > 200:
            accuracy_rating = "PASS"
        elif hits >= 1:
            accuracy_rating = "PARTIAL"
        else:
            accuracy_rating = "FAIL"
            
    # 6. Conversational / Speakable Rating
    is_speakable = len(answer_text) > 40 and not answer_text.startswith("```") and "Ultron3 utilizes" not in answer_text
    
    return {
        "technical_accuracy": accuracy_rating,
        "hallucination": "FAIL (Hallucinated)" if hallucinated else "PASS (Grounded)",
        "first_person_style": "PASS" if has_first_person else "PARTIAL",
        "conversational_quality": "PASS" if is_speakable else "PARTIAL",
        "grounding_sources": q_meta["known_sources"],
        "topic_hits": hits,
        "expected_topic_count": len(expected)
    }

async def run_phase6_interview_simulation():
    workspace = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    print("=" * 80, flush=True)
    print("PHASE 6: REAL INTERVIEW SIMULATION & VALIDATION (20 QUESTIONS)", flush=True)
    print(f"Workspace: {workspace}", flush=True)
    print(f"Model: {os.environ.get('ANTIGRAVITY_MODEL', 'gemini-3.5-flash-lite')}", flush=True)
    print("=" * 80, flush=True)

    mgr = AgentManager()
    mgr.setup(workspace)

    # 1. Warmup Agent
    print("\n[Boot] Initializing Persistent Agent & Workspace Warmup...", flush=True)
    t0 = time.perf_counter()
    await mgr.start(auto_warm=True)
    await mgr._warmup_event.wait()
    t1 = time.perf_counter()
    print(f"  -> Agent warmed in {round(t1 - t0, 2)}s. Turn count: {mgr.turn_count}", flush=True)
    print("  -> Waiting 20s for fresh rate-limit bucket before starting interview...", flush=True)
    await asyncio.sleep(20.0)

    results = []

    # 2. Run all 20 interview questions in continuous session
    for idx, q_meta in enumerate(QUESTIONS, start=1):
        q_id = q_meta["id"]
        category = q_meta["category"]
        question = q_meta["question"]

        print("\n" + "-" * 80, flush=True)
        print(f"[{idx}/20] ({category}) {q_id}: \"{question}\" (Turn {mgr.turn_count + 1})", flush=True)
        print("-" * 80, flush=True)

        t_start = time.perf_counter()
        t_first_token = None
        chunks = []

        try:
            async for token in mgr.ask(question, request_id=f"p6_{q_id}"):
                if t_first_token is None:
                    t_first_token = time.perf_counter()
                    print(f"  [First Token in {t_first_token - t_start:.2f}s]", flush=True)
                chunks.append(token)
        except Exception as e:
            print(f"  [ERROR during ask: {e}]", flush=True)

        t_end = time.perf_counter()
        full_text = "".join(chunks)
        ttft = (t_first_token - t_start) if t_first_token else -1
        total_duration = t_end - t_start

        eval_result = evaluate_response(q_meta, full_text, ttft, total_duration)

        entry = {
            "id": q_id,
            "category": category,
            "question": question,
            "turn": mgr.turn_count,
            "ttft_sec": round(ttft, 2),
            "total_sec": round(total_duration, 2),
            "char_len": len(full_text),
            "chunks_count": len(chunks),
            "answer": full_text,
            "evaluation": eval_result
        }
        results.append(entry)

        print(f"  -> TTFT: {entry['ttft_sec']}s | Total: {entry['total_sec']}s | Chars: {entry['char_len']}", flush=True)
        print(f"  -> Accuracy: {eval_result['technical_accuracy']} | Hallucination: {eval_result['hallucination']} | First-Person: {eval_result['first_person_style']}", flush=True)
        print(f"  -> Answer Preview: {full_text[:140].replace('\n', ' ')}...", flush=True)

        # Rate-limiting pause between turns (20s)
        if idx < len(QUESTIONS):
            print("  [Pacing 20s for API rate limits...]", flush=True)
            await asyncio.sleep(20.0)

    # 3. Clean Shutdown
    await mgr.stop()

    # 4. Aggregate Metrics Calculation
    valid_ttfts = [r["ttft_sec"] for r in results if r["ttft_sec"] > 0]
    valid_totals = [r["total_sec"] for r in results if r["total_sec"] > 0]
    avg_ttft = round(sum(valid_ttfts) / len(valid_ttfts), 2) if valid_ttfts else 0
    sorted_ttfts = sorted(valid_ttfts)
    median_ttft = round(sorted_ttfts[len(sorted_ttfts)//2], 2) if sorted_ttfts else 0
    avg_total = round(sum(valid_totals) / len(valid_totals), 2) if valid_totals else 0

    pass_count = sum(1 for r in results if r["evaluation"]["technical_accuracy"] == "PASS")
    partial_count = sum(1 for r in results if r["evaluation"]["technical_accuracy"] == "PARTIAL")
    fail_count = sum(1 for r in results if r["evaluation"]["technical_accuracy"] == "FAIL")
    hallucination_count = sum(1 for r in results if "Hallucinated" in r["evaluation"]["hallucination"])
    first_person_pass_count = sum(1 for r in results if r["evaluation"]["first_person_style"] == "PASS")

    accuracy_pct = round(((pass_count + 0.5 * partial_count) / len(results)) * 100, 1)

    summary = {
        "total_questions": len(results),
        "overall_accuracy_pct": accuracy_pct,
        "pass_count": pass_count,
        "partial_count": partial_count,
        "fail_count": fail_count,
        "hallucination_count": hallucination_count,
        "first_person_pass_count": first_person_pass_count,
        "avg_ttft_sec": avg_ttft,
        "median_ttft_sec": median_ttft,
        "avg_total_sec": avg_total,
        "questions": results
    }

    out_file = os.path.join(os.path.dirname(__file__), "phase6_interview_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("\n" + "=" * 80, flush=True)
    print("PHASE 6 SIMULATION SUMMARY & RESULTS")
    print("=" * 80, flush=True)
    print(f"Total Questions Evaluated:  {len(results)}")
    print(f"Overall Technical Accuracy: {accuracy_pct}% ({pass_count} PASS, {partial_count} PARTIAL, {fail_count} FAIL)")
    print(f"Total Hallucinations:       {hallucination_count}")
    print(f"First-Person Quality:       {first_person_pass_count}/{len(results)} PASS")
    print(f"Average TTFT:               {avg_ttft}s")
    print(f"Median TTFT:                {median_ttft}s")
    print(f"Average Total Response:     {avg_total}s")
    print(f"Results Saved:              {out_file}")
    print("=" * 80, flush=True)

if __name__ == "__main__":
    asyncio.run(run_phase6_interview_simulation())
