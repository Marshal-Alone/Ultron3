/**
 * audioCaptureRenderer.js
 * Renderer-side WebRTC and Web Audio API capture manager.
 * Captures system loopback audio and microphone streams at 24kHz.
 */

const { ipcRenderer } = require('electron');
const { convertFloat32ToInt16, arrayBufferToBase64 } = require('./audioUtils');

const SAMPLE_RATE = 24000;
const AUDIO_CHUNK_DURATION = 0.1; // 100ms
const BUFFER_SIZE = 4096;

class AudioCaptureEngine {
    constructor() {
        this.mediaStream = null;
        this.micStream = null;
        this.audioContext = null;
        this.audioProcessor = null;
        this.micAudioContext = null;
        this.micAudioProcessor = null;
        this.isCapturing = false;
    }

    /**
     * Starts cross-platform system audio and/or microphone capture.
     * @param {'speaker_only'|'mic_only'|'both'} audioMode
     */
    async start(audioMode = 'speaker_only') {
        if (this.isCapturing) return;
        this.isCapturing = true;

        const isMacOS = process.platform === 'darwin';

        try {
            if (isMacOS) {
                // macOS: System audio is captured via native helper daemon
                await ipcRenderer.invoke('start-macos-audio');

                // Get screen stream (video only on macOS)
                this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });

                if (audioMode === 'mic_only' || audioMode === 'both') {
                    await this._startMicCapture();
                }
            } else {
                // Windows / Linux: Capture system loopback via getDisplayMedia
                if (audioMode !== 'mic_only') {
                    this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                        video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } },
                        audio: {
                            sampleRate: SAMPLE_RATE,
                            channelCount: 1,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                    });

                    this._setupSystemAudioProcessing(this.mediaStream);
                }

                if (audioMode === 'mic_only' || audioMode === 'both') {
                    await this._startMicCapture();
                }
            }

            console.log(`[AudioEngine] Capture started (mode: ${audioMode})`);
        } catch (error) {
            console.error('[AudioEngine] Failed to start capture:', error);
            this.stop();
            throw error;
        }
    }

    _setupSystemAudioProcessing(stream) {
        this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
        const source = this.audioContext.createMediaStreamSource(stream);
        this.audioProcessor = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

        let audioBuffer = [];
        const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION; // 2400 samples

        this.audioProcessor.onaudioprocess = async event => {
            if (!this.isCapturing) return;
            const inputData = event.inputBuffer.getChannelData(0);
            audioBuffer.push(...inputData);

            while (audioBuffer.length >= samplesPerChunk) {
                const chunk = audioBuffer.splice(0, samplesPerChunk);
                const pcm16 = convertFloat32ToInt16(chunk);
                const base64Data = arrayBufferToBase64(pcm16.buffer);

                // Send to main process
                await ipcRenderer.invoke('send-audio-content', {
                    data: base64Data,
                    mimeType: 'audio/pcm;rate=24000',
                });
            }
        };

        source.connect(this.audioProcessor);
        this.audioProcessor.connect(this.audioContext.destination);
    }

    async _startMicCapture() {
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: SAMPLE_RATE,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: false,
            });

            this.micAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
            const micSource = this.micAudioContext.createMediaStreamSource(this.micStream);
            this.micAudioProcessor = this.micAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

            let micBuffer = [];
            const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

            this.micAudioProcessor.onaudioprocess = async event => {
                if (!this.isCapturing) return;
                const inputData = event.inputBuffer.getChannelData(0);
                micBuffer.push(...inputData);

                while (micBuffer.length >= samplesPerChunk) {
                    const chunk = micBuffer.splice(0, samplesPerChunk);
                    const pcm16 = convertFloat32ToInt16(chunk);
                    const base64Data = arrayBufferToBase64(pcm16.buffer);

                    await ipcRenderer.invoke('send-mic-audio-content', {
                        data: base64Data,
                        mimeType: 'audio/pcm;rate=24000',
                    });
                }
            };

            micSource.connect(this.micAudioProcessor);
            this.micAudioProcessor.connect(this.micAudioContext.destination);
        } catch (error) {
            console.warn('[AudioEngine] Could not access microphone:', error);
        }
    }

    /**
     * Stops all active audio capture streams and cleans up AudioContexts.
     */
    stop() {
        this.isCapturing = false;

        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            this.audioProcessor = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.micAudioProcessor) {
            this.micAudioProcessor.disconnect();
            this.micAudioProcessor = null;
        }
        if (this.micAudioContext) {
            this.micAudioContext.close();
            this.micAudioContext = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(t => t.stop());
            this.mediaStream = null;
        }
        if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
            this.micStream = null;
        }

        if (process.platform === 'darwin') {
            ipcRenderer.invoke('stop-macos-audio').catch(() => {});
        }

        console.log('[AudioEngine] Capture stopped');
    }
}

module.exports = new AudioCaptureEngine();
