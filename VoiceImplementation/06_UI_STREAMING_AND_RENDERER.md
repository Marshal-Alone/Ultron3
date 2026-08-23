# UI Streaming & Frontend Renderer Guide

## 1. High-Performance Token Streaming & Markdown Rendering

When tokens stream in at 30–50 words per second from Groq or Gemini Live, re-parsing the entire DOM indiscriminately causes screen flicker, lost scroll position, and UI lag. 

The frontend uses an optimized Markdown pipeline combining `marked.js` with word-wrapping and smooth DOM updates:

```javascript
// 1. Configure marked for break handling
marked.setOptions({
    breaks: true,
    gfm: true,
    sanitize: false,
});

// 2. Render Markdown & Wrap Words to prevent line break jumping
function renderMarkdownStream(rawMarkdown) {
    let htmlContent = marked.parse(rawMarkdown);
    return wrapWordsInSpans(htmlContent);
}

// 3. Word-level DOM wrapper ensures smooth CSS rendering
function wrapWordsInSpans(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tagsToSkip = ['PRE', 'CODE'];

    function wrap(node) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() && !tagsToSkip.includes(node.parentNode.tagName)) {
            const words = node.textContent.split(/(\s+)/);
            const fragment = document.createDocumentFragment();
            words.forEach(word => {
                if (word.trim()) {
                    const span = document.createElement('span');
                    span.setAttribute('data-word', '');
                    span.textContent = word;
                    fragment.appendChild(span);
                } else {
                    fragment.appendChild(document.createTextNode(word));
                }
            });
            node.parentNode.replaceChild(fragment, node);
        } else if (node.nodeType === Node.ELEMENT_NODE && !tagsToSkip.includes(node.tagName)) {
            Array.from(node.childNodes).forEach(wrap);
        }
    }

    Array.from(doc.body.childNodes).forEach(wrap);
    return doc.body.innerHTML;
}
```

---

## 2. Response Turn History & Navigation

As a conversation progresses, multiple questions and answers occur. The UI stores them in a chronological response array:

```javascript
let responses = [];
let currentResponseIndex = -1;

function addNewResponse(text) {
    responses.push(text);
    currentResponseIndex = responses.length - 1;
    updateResponseUI();
}

function updateCurrentResponse(latestText) {
    if (responses.length > 0) {
        responses[responses.length - 1] = latestText;
    } else {
        addNewResponse(latestText);
    }
    updateResponseUI();
}

function navigatePrevious() {
    if (currentResponseIndex > 0) {
        currentResponseIndex--;
        updateResponseUI();
    }
}

function navigateNext() {
    if (currentResponseIndex < responses.length - 1) {
        currentResponseIndex++;
        updateResponseUI();
    }
}
```

---

## 3. Sound-Reactive Waveform & Particle Canvas Animation

To give the user visual feedback that the system is actively listening to speech or generating an answer, an HTML5 canvas renders an animated soundwave with particle physics:

```javascript
function startWaveformAnimation(canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const startTime = performance.now();

    const waves = [
        { freq: 3, amp: 0.35, speed: 2.5, opacity: 0.9, width: 1.8 },
        { freq: 5, amp: 0.20, speed: 3.5, opacity: 0.5, width: 1.2 },
        { freq: 7, amp: 0.12, speed: 5.0, opacity: 0.3, width: 0.8 },
    ];

    let animFrame = null;

    function draw(now) {
        const elapsed = (now - startTime) / 1000;
        ctx.clearRect(0, 0, w, h);

        const midY = h / 2;
        ctx.strokeStyle = '#3B82F6'; // Accent blue

        for (const wave of waves) {
            ctx.beginPath();
            ctx.globalAlpha = wave.opacity;
            ctx.lineWidth = wave.width;
            ctx.lineCap = 'round';

            for (let x = 0; x <= w; x++) {
                const norm = x / w;
                const envelope = Math.sin(norm * Math.PI); // Pinches ends
                const y = midY + Math.sin(norm * Math.PI * 2 * wave.freq + elapsed * wave.speed) * (midY * wave.amp) * envelope;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        animFrame = requestAnimationFrame(draw);
    }

    animFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrame);
}
```

---

## 4. Audio Mode Selector Logic

Users can select between three listening modes depending on their environment:

```javascript
const AudioModes = {
    SPEAKER_ONLY: 'speaker_only', // Only transcribe what the other party is saying through speakers
    MIC_ONLY:     'mic_only',     // Only transcribe what the user says into microphone
    BOTH:         'both',         // Transcribe both speakers and user simultaneously
};

async function applyAudioMode(mode) {
    await storage.updatePreference('audioMode', mode);
    
    // When both or mic is selected, activate getUserMedia in parallel with getDisplayMedia
    if (mode === AudioModes.MIC_ONLY || mode === AudioModes.BOTH) {
        startMicrophoneStream();
    }
}
```
