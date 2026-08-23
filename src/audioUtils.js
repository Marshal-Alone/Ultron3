/**
 * audioUtils.js
 * Comprehensive audio processing, format conversion, analysis, and VAD utilities.
 */

const fs = require('fs');
const path = require('path');

/**
 * Converts Float32Array from Web Audio API [-1.0, 1.0] to Int16Array [-32768, 32767]
 * Clamps values to avoid integer overflow clipping.
 */
function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
}

/**
 * Converts an ArrayBuffer or Uint8Array to a Base64-encoded string.
 */
function arrayBufferToBase64(buffer) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(buffer).toString('base64');
    }
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Downmixes a 16-bit Stereo PCM Buffer to 16-bit Mono PCM Buffer.
 */
function convertStereoToMono(stereoBuffer) {
    const samples = Math.floor(stereoBuffer.length / 4); // 2 channels * 2 bytes
    const monoBuffer = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
        const leftSample = stereoBuffer.readInt16LE(i * 4);
        monoBuffer.writeInt16LE(leftSample, i * 2);
    }

    return monoBuffer;
}

/**
 * Creates a standard 44-byte RIFF WAV Header for raw PCM data.
 */
function createWavHeader(dataSize, sampleRate = 24000, channels = 1, bitDepth = 16) {
    const byteRate = sampleRate * channels * (bitDepth / 8);
    const blockAlign = channels * (bitDepth / 8);
    const header = Buffer.alloc(44);

    // "RIFF" Chunk
    header.write('RIFF', 0);
    header.writeUInt32LE(dataSize + 36, 4);
    header.write('WAVE', 8);

    // "fmt " Subchunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
    header.writeUInt16LE(channels, 22); // NumChannels
    header.writeUInt32LE(sampleRate, 24); // SampleRate
    header.writeUInt32LE(byteRate, 28); // ByteRate
    header.writeUInt16LE(blockAlign, 32); // BlockAlign
    header.writeUInt16LE(bitDepth, 34); // BitsPerSample

    // "data" Subchunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return header;
}

/**
 * Wraps a raw PCM buffer with a WAV header.
 * Supports both:
 *   pcmToWav(pcmBuffer, outputPath, sampleRate, channels, bitDepth) -> returns outputPath (writes file)
 *   pcmToWav(pcmBuffer, sampleRate, channels, bitDepth) -> returns complete Buffer
 */
function pcmToWav(pcmBuffer, outputPathOrSampleRate, sampleRate = 24000, channels = 1, bitDepth = 16) {
    let outputPath = null;
    let actualSampleRate = sampleRate;
    let actualChannels = channels;
    let actualBitDepth = bitDepth;

    if (typeof outputPathOrSampleRate === 'string') {
        outputPath = outputPathOrSampleRate;
    } else if (typeof outputPathOrSampleRate === 'number') {
        actualSampleRate = outputPathOrSampleRate;
    }

    const header = createWavHeader(pcmBuffer.length, actualSampleRate, actualChannels, actualBitDepth);
    const wavBuffer = Buffer.concat([header, pcmBuffer]);

    if (outputPath) {
        fs.writeFileSync(outputPath, wavBuffer);
        return outputPath;
    }

    return wavBuffer;
}

/**
 * Computes RMS (Root Mean Square) energy of a 16-bit PCM buffer.
 */
function calculateRms(pcm16Buffer) {
    let int16Array;
    if (Buffer.isBuffer(pcm16Buffer)) {
        int16Array = new Int16Array(pcm16Buffer.buffer, pcm16Buffer.byteOffset, Math.floor(pcm16Buffer.length / 2));
    } else if (pcm16Buffer instanceof Int16Array) {
        int16Array = pcm16Buffer;
    } else if (Array.isArray(pcm16Buffer) || pcm16Buffer instanceof Float32Array) {
        int16Array = convertFloat32ToInt16(pcm16Buffer);
    } else {
        return 0;
    }

    const samples = int16Array.length;
    if (samples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < samples; i++) {
        const normalized = int16Array[i] / 32768;
        sumSquares += normalized * normalized;
    }

    return Math.sqrt(sumSquares / samples);
}

/**
 * Resamples 24kHz Int16 PCM to 16kHz Int16 PCM via linear interpolation.
 */
function resample24kTo16k(inputBuffer) {
    const isBuf = Buffer.isBuffer(inputBuffer);
    const byteLen = inputBuffer.length * (isBuf ? 1 : 2);
    const inputSamples = Math.floor(isBuf ? inputBuffer.length / 2 : inputBuffer.length);
    const outputSamples = Math.floor((inputSamples * 2) / 3);
    const outputBuffer = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
        const sourcePosition = (i * 3) / 2;
        const sourceIndex = Math.floor(sourcePosition);
        const fraction = sourcePosition - sourceIndex;

        const firstSample = isBuf ? inputBuffer.readInt16LE(sourceIndex * 2) : inputBuffer[sourceIndex];
        const secondSample =
            sourceIndex + 1 < inputSamples ? (isBuf ? inputBuffer.readInt16LE((sourceIndex + 1) * 2) : inputBuffer[sourceIndex + 1]) : firstSample;

        const interpolated = Math.round(firstSample + fraction * (secondSample - firstSample));
        outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
    }

    return outputBuffer;
}

/**
 * Voice Activity Detection (VAD) state machine with linear 24k -> 16k resampling.
 */
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

    resample(inputBuffer) {
        const combined = Buffer.concat([this.resampleRemainder, inputBuffer]);
        const inputSamples = Math.floor(combined.length / 2);
        const outputSamples = Math.floor((inputSamples * 2) / 3);
        const outputBuffer = Buffer.alloc(outputSamples * 2);

        for (let i = 0; i < outputSamples; i++) {
            const sourcePosition = (i * 3) / 2;
            const sourceIndex = Math.floor(sourcePosition);
            const fraction = sourcePosition - sourceIndex;

            const firstSample = combined.readInt16LE(sourceIndex * 2);
            const secondSample = sourceIndex + 1 < inputSamples ? combined.readInt16LE((sourceIndex + 1) * 2) : firstSample;

            const interpolated = Math.round(firstSample + fraction * (secondSample - firstSample));
            outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
        }

        const consumed = Math.ceil((outputSamples * 3) / 2);
        const remainderStart = consumed * 2;
        this.resampleRemainder = remainderStart < combined.length ? combined.slice(remainderStart) : Buffer.alloc(0);

        return outputBuffer;
    }

    processAudio(monoChunk24k) {
        const pcm16k = this.resample(monoChunk24k);
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

                if (audioData.length >= 16000) {
                    // At least 0.5s of speech at 16kHz
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

// Analyze audio buffer for debugging
function analyzeAudioBuffer(buffer, label = 'Audio') {
    const int16Array = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

    let minValue = 32767;
    let maxValue = -32768;
    let avgValue = 0;
    let rmsValue = 0;
    let silentSamples = 0;

    for (let i = 0; i < int16Array.length; i++) {
        const sample = int16Array[i];
        minValue = Math.min(minValue, sample);
        maxValue = Math.max(maxValue, sample);
        avgValue += sample;
        rmsValue += sample * sample;

        if (Math.abs(sample) < 100) {
            silentSamples++;
        }
    }

    avgValue /= int16Array.length;
    rmsValue = Math.sqrt(rmsValue / int16Array.length);

    const silencePercentage = (silentSamples / int16Array.length) * 100;

    console.log(`${label} Analysis:`);
    console.log(`  Samples: ${int16Array.length}`);
    console.log(`  Min: ${minValue}, Max: ${maxValue}`);
    console.log(`  Average: ${avgValue.toFixed(2)}`);
    console.log(`  RMS: ${rmsValue.toFixed(2)}`);
    console.log(`  Silence: ${silencePercentage.toFixed(1)}%`);
    console.log(`  Dynamic Range: ${20 * Math.log10(maxValue / (rmsValue || 1))} dB`);

    return {
        minValue,
        maxValue,
        avgValue,
        rmsValue,
        silencePercentage,
        sampleCount: int16Array.length,
    };
}

// Save audio buffer with metadata for debugging
function saveDebugAudio(buffer, type, timestamp = Date.now()) {
    const homeDir = require('os').homedir();
    const debugDir = path.join(homeDir, 'jarvis-debug');

    if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
    }

    const pcmPath = path.join(debugDir, `${type}_${timestamp}.pcm`);
    const wavPath = path.join(debugDir, `${type}_${timestamp}.wav`);
    const metaPath = path.join(debugDir, `${type}_${timestamp}.json`);

    // Save raw PCM
    fs.writeFileSync(pcmPath, buffer);

    // Convert to WAV for easy playback
    pcmToWav(buffer, wavPath);

    // Analyze and save metadata
    const analysis = analyzeAudioBuffer(buffer, type);
    fs.writeFileSync(
        metaPath,
        JSON.stringify(
            {
                timestamp,
                type,
                bufferSize: buffer.length,
                analysis,
                format: {
                    sampleRate: 24000,
                    channels: 1,
                    bitDepth: 16,
                },
            },
            null,
            2
        )
    );

    console.log(`Debug audio saved: ${wavPath}`);

    return { pcmPath, wavPath, metaPath };
}

module.exports = {
    convertFloat32ToInt16,
    arrayBufferToBase64,
    convertStereoToMono,
    createWavHeader,
    pcmToWav,
    calculateRms,
    resample24kTo16k,
    VadResampler,
    analyzeAudioBuffer,
    saveDebugAudio,
};
