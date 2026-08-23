/**
 * vadResampler.js
 * 24kHz to 16kHz audio resampler & Voice Activity Detection (VAD) state machine.
 */

const { calculateRms } = require('./audioUtils');

class VadResampler {
    constructor(options = {}) {
        this.energyThreshold = options.energyThreshold || 0.015;
        this.speechFramesRequired = options.speechFramesRequired || 2;
        this.silenceFramesRequired = options.silenceFramesRequired || 20;
        
        this.isSpeaking = false;
        this.speechBuffers = [];
        this.silenceFrameCount = 0;
        this.speechFrameCount = 0;
        this.resampleRemainder = Buffer.alloc(0);

        this.onSpeechStart = null;
        this.onSpeechEnd = null; // (complete16kWavBuffer) => void
    }

    /**
     * Resamples 24kHz Int16 PCM to 16kHz Int16 PCM via linear interpolation.
     */
    resample24kTo16k(inputBuffer) {
        const combined = Buffer.concat([this.resampleRemainder, inputBuffer]);
        const inputSamples = Math.floor(combined.length / 2);
        const outputSamples = Math.floor((inputSamples * 2) / 3);
        const outputBuffer = Buffer.alloc(outputSamples * 2);

        for (let i = 0; i < outputSamples; i++) {
            const sourcePosition = (i * 3) / 2;
            const sourceIndex = Math.floor(sourcePosition);
            const fraction = sourcePosition - sourceIndex;
            
            const firstSample = combined.readInt16LE(sourceIndex * 2);
            const secondSample = sourceIndex + 1 < inputSamples 
                ? combined.readInt16LE((sourceIndex + 1) * 2) 
                : firstSample;
                
            const interpolated = Math.round(firstSample + fraction * (secondSample - firstSample));
            outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
        }

        const consumed = Math.ceil((outputSamples * 3) / 2);
        const remainderStart = consumed * 2;
        this.resampleRemainder = remainderStart < combined.length 
            ? combined.slice(remainderStart) 
            : Buffer.alloc(0);

        return outputBuffer;
    }

    /**
     * Ingests a 24kHz Int16 PCM chunk and evaluates speech state.
     * @param {Buffer} monoChunk24k
     */
    processAudio(monoChunk24k) {
        const pcm16k = this.resample24kTo16k(monoChunk24k);
        if (pcm16k.length === 0) return;

        const rms = calculateRms(pcm16k);
        const isVoice = rms > this.energyThreshold;

        if (isVoice) {
            this.speechFrameCount += 1;
            this.silenceFrameCount = 0;

            if (!this.isSpeaking && this.speechFrameCount >= this.speechFramesRequired) {
                this.isSpeaking = true;
                this.speechBuffers = [];
                this.onSpeechStart?.(rms);
            }
        } else {
            this.silenceFrameCount += 1;
            this.speechFrameCount = 0;

            if (this.isSpeaking && this.silenceFrameCount >= this.silenceFramesRequired) {
                this.isSpeaking = false;
                const audioData = Buffer.concat(this.speechBuffers);
                this.speechBuffers = [];

                if (audioData.length >= 16000) { // At least 0.5s of speech
                    this.onSpeechEnd?.(audioData);
                }
                return;
            }
        }

        if (this.isSpeaking) {
            this.speechBuffers.push(Buffer.from(pcm16k));
        }
    }

    reset() {
        this.isSpeaking = false;
        this.speechBuffers = [];
        this.silenceFrameCount = 0;
        this.speechFrameCount = 0;
        this.resampleRemainder = Buffer.alloc(0);
    }
}

module.exports = VadResampler;
