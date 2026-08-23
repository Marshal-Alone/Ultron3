# Dual-AI Architecture: Gemini STT + Groq Fast LLM

## 1. Why Dual-AI? The Sub-Second Latency Breakthrough

In live conversational settings (such as interviews, meetings, customer support, or technical negotiations), **latency is everything**. If the AI takes 3–5 seconds to respond after someone finishes speaking, the user cannot smoothly use the answer in real-time.

```
Traditional Flow (Slow: 3-5 seconds):
User Speech -> Audio Chunking -> STT API -> Complete Text -> LLM Processing -> Complete Response

Dual-AI Real-Time Flow (Ultra-Fast: 200-400ms):
[Continuous 24kHz Audio Stream]
             │
             ▼
   Gemini Live API (WebSocket) ──► Instant Streaming Diarized Text
                                                │
                                                ▼
                                    Groq LPUs (LPU Inference Engine)
                                                │
                                                ▼ (300+ tokens/sec)
                                    Renderer (Instant UI Stream)
```

1. **Gemini Live** continuously transcribes and diarizes incoming speech with zero manual push-to-talk buttons.
2. The instant a sentence or question is transcribed, it is dispatched to **Groq's LPU hardware**.
3. Groq generates the response at **300+ tokens per second**, streaming the first tokens to the user's screen in **under 300 milliseconds**.

---

## 2. Implementation: Groq Streaming Client

### Full Code Implementation (`gemini.js` -> `sendToGroq`):

```javascript
let groqConversationHistory = [];
const GROQ_MAX_COMPLETION_TOKENS = 16384;

async function sendToGroq(transcription) {
    const groqApiKey = getGroqApiKey();
    if (!groqApiKey || !transcription || transcription.trim() === '') {
        return;
    }

    const modelToUse = 'qwen/qwen3.6-27b'; // or 'llama-3.3-70b-versatile'

    // Maintain sliding context history (last 20 messages)
    groqConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    if (groqConversationHistory.length > 20) {
        groqConversationHistory = groqConversationHistory.slice(-20);
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelToUse,
                messages: [
                    {
                        role: 'system',
                        content:
                            currentSystemPrompt || 'You are an ultra-concise assistant. Give direct, ready-to-speak answers in 1-3 bullet points.',
                    },
                    ...groqConversationHistory,
                ],
                stream: true,
                temperature: 0.7,
                max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
                ...getGroqReasoningOptions(modelToUse, true), // Disable internal thinking for lowest latency
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API error:', response.status, errorText);
            sendToRenderer('update-status', `Groq error: ${response.status}`);
            return;
        }

        // Stream reader for Server-Sent Events (SSE)
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const json = JSON.parse(data);
                        const token = json.choices?.[0]?.delta?.content || '';

                        if (token) {
                            fullText += token;

                            // Strip reasoning tags in real time before sending to UI
                            const displayText = stripThinkingTags(fullText);
                            if (displayText) {
                                sendToRenderer(isFirst ? 'new-response' : 'update-response', displayText);
                                isFirst = false;
                            }
                        }
                    } catch (parseError) {
                        // Partial JSON chunk - ignore and continue
                    }
                }
            }
        }

        const cleanedResponse = stripThinkingTags(fullText);
        if (cleanedResponse) {
            groqConversationHistory.push({
                role: 'assistant',
                content: cleanedResponse,
            });
            saveConversationTurn(transcription, cleanedResponse);
        }

        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        console.error('Error calling Groq API:', error);
        sendToRenderer('update-status', 'Groq error: ' + error.message);
    }
}
```

---

## 3. Real-Time `<think>` Tag Stripping

Modern reasoning models (like Qwen 2.5 / 3.5, DeepSeek R1, etc.) output thoughts enclosed in `<think>...</think>` tags. Because users need the final answer immediately, internal thinking must be stripped on the fly:

```javascript
function stripThinkingTags(text) {
    const trimmedStart = text.trimStart();
    // If stream is still inside the opening <think> block, show nothing yet
    if ('<think>'.startsWith(trimmedStart)) {
        return '';
    }

    // Strip complete or open <think> tags
    return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
}

function getGroqReasoningOptions(model, disableThinking) {
    if (model.includes('qwen3')) {
        return {
            reasoning_format: 'hidden',
            ...(disableThinking ? { reasoning_effort: 'none' } : {}),
        };
    }

    if (model.startsWith('openai/gpt-oss-')) {
        return {
            include_reasoning: false,
        };
    }

    return {};
}
```

---

## 4. Prompt Engineering for Real-Time Teleprompting

System prompts must enforce concise, impactful, direct-to-speech output so the user can read the answers effortlessly:

```javascript
const profilePrompts = {
    interview: `You are an AI-powered interview assistant, acting as a discreet on-screen teleprompter.
Your mission is to help the user excel by providing concise, impactful, ready-to-speak answers.

RESPONSE FORMAT REQUIREMENTS:
- Keep responses SHORT and CONCISE (1-3 sentences or bullet points max)
- Use **bold** for key terms
- Provide ONLY the exact words to speak. No coaching, no "you should say", no conversational filler.`,

    meeting: `You are a meeting executive assistant. Provide concise, direct responses, action items, or numbers to state in business meetings.`,

    exam: `You are an exam assistant. Give the exact question, correct answer option, and 1 sentence justification.`,
};
```

---

## 5. Token Usage Tracking & Rate Limit Mitigation

To prevent unexpected billing or rate limit exhaustion (RPD/RPM):

```javascript
function trackUsage(provider, model, inputLength, outputLength) {
    const totalChars = inputLength + outputLength;
    console.log(`[Usage] ${provider}:${model} used ${totalChars} characters`);

    // Store in daily limits registry
    incrementCharUsage(provider, model, totalChars);
}
```
