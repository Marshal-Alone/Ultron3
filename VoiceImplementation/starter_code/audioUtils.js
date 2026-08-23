/**
 * audioUtils.js
 * Comprehensive audio processing, format conversion, and analysis utilities.
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
 * Converts an ArrayBuffer to a Base64-encoded string.
 */
function arrayBufferToBase64(buffer) {
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
    const samples = stereoBuffer.length / 4; // 2 channels * 2 bytes
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
 * Wraps a raw PCM buffer with a WAV header and returns a complete WAV Buffer.
 */
function pcmToWav(pcmBuffer, sampleRate = 24000, channels = 1, bitDepth = 16) {
    const header = createWavHeader(pcmBuffer.length, sampleRate, channels, bitDepth);
    return Buffer.concat([header, pcmBuffer]);
}

/**
 * Computes RMS (Root Mean Square) energy of a 16-bit PCM buffer.
 */
function calculateRms(pcm16Buffer) {
    const samples = pcm16Buffer.length / 2;
    if (samples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < samples; i++) {
        const sample = pcm16Buffer.readInt16LE(i * 2) / 32768;
        sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / samples);
}

module.exports = {
    convertFloat32ToInt16,
    arrayBufferToBase64,
    convertStereoToMono,
    createWavHeader,
    pcmToWav,
    calculateRms,
};
