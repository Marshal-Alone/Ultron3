# API Integrations

Ultron3 interfaces with several external LLM APIs.

## 1. Google Gemini API (`@google/genai`)
- **Primary Use**: Real-time duplex audio chat and transcription.
- **Model**: `gemini-2.5-flash-native-audio-latest`.
- **Implementation**: `src/utils/gemini.js`. Uses the v1alpha WebSocket `LiveAPI` to stream Base64 encoded 16kHz Mono PCM audio continuously.
- **Constraints**: Tracks daily usage in `limits.json` to avoid rate limits, falling back to `gemini-2.5-flash-lite`.

## 2. Groq API (`openai` SDK)
- **Primary Use**: Ultra-low-latency text generation and Vision OCR solving.
- **Base URL**: `https://api.groq.com/openai/v1`
- **Models**: `qwen/qwen3.6-27b` (Vision), `openai/gpt-oss-120b` (Reasoning).
- **Implementation**: `src/utils/groq.js`. Uses SSE (Server-Sent Events) streaming.

## 3. OpenRouter API
- *Note*: Credentials exist in storage, but the explicit implementation appears to be deferred or used as an undocumented fallback via the OpenAI SDK wrapper.
