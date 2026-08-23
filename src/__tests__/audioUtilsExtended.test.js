const {
    convertFloat32ToInt16,
    arrayBufferToBase64,
    convertStereoToMono,
    createWavHeader,
    pcmToWav,
    calculateRms,
    resample24kTo16k,
    VadResampler,
} = require('../audioUtils');

describe('Extended audio utilities', () => {
    describe('convertFloat32ToInt16', () => {
        it('converts normalized float array to 16-bit signed integer PCM', () => {
            const input = new Float32Array([0.0, 1.0, -1.0, 0.5, -0.5, 2.0, -2.0]);
            const output = convertFloat32ToInt16(input);

            expect(output[0]).toBe(0);
            expect(output[1]).toBe(32767);
            expect(output[2]).toBe(-32768);
            expect(output[3]).toBe(16383); // 0.5 * 32767
            expect(output[4]).toBe(-16384); // -0.5 * 32768
            // Clamping check
            expect(output[5]).toBe(32767);
            expect(output[6]).toBe(-32768);
        });
    });

    describe('arrayBufferToBase64', () => {
        it('encodes byte array to valid base64', () => {
            const buffer = Buffer.from('hello world', 'utf8');
            const base64 = arrayBufferToBase64(buffer);
            expect(base64).toBe(Buffer.from('hello world').toString('base64'));
        });
    });

    describe('convertStereoToMono', () => {
        it('downmixes 16-bit interleaved stereo buffer to mono', () => {
            // 2 samples stereo: Left=1000, Right=2000, Left=3000, Right=4000
            const stereo = Buffer.alloc(8);
            stereo.writeInt16LE(1000, 0);
            stereo.writeInt16LE(2000, 2);
            stereo.writeInt16LE(3000, 4);
            stereo.writeInt16LE(4000, 6);

            const mono = convertStereoToMono(stereo);
            expect(mono.length).toBe(4);
            expect(mono.readInt16LE(0)).toBe(1000);
            expect(mono.readInt16LE(2)).toBe(3000);
        });
    });

    describe('createWavHeader', () => {
        it('creates a standard 44-byte WAV header', () => {
            const header = createWavHeader(4800, 24000, 1, 16);
            expect(header.length).toBe(44);
            expect(header.toString('ascii', 0, 4)).toBe('RIFF');
            expect(header.toString('ascii', 8, 12)).toBe('WAVE');
            expect(header.toString('ascii', 12, 16)).toBe('fmt ');
            expect(header.readUInt32LE(24)).toBe(24000); // sampleRate
            expect(header.readUInt16LE(22)).toBe(1); // channels
            expect(header.readUInt16LE(34)).toBe(16); // bitDepth
            expect(header.readUInt32LE(40)).toBe(4800); // dataSize
        });
    });

    describe('calculateRms', () => {
        it('calculates 0 for silent buffer', () => {
            const silent = Buffer.alloc(200);
            expect(calculateRms(silent)).toBe(0);
        });

        it('calculates non-zero RMS for active signal', () => {
            const active = Buffer.alloc(200);
            for (let i = 0; i < 100; i++) {
                active.writeInt16LE(10000, i * 2);
            }
            const rms = calculateRms(active);
            expect(rms).toBeGreaterThan(0.2);
            expect(rms).toBeLessThan(0.4);
        });
    });

    describe('resample24kTo16k', () => {
        it('resamples 24kHz buffer to 16kHz with 2/3 ratio', () => {
            // 2400 samples (100ms at 24kHz) = 4800 bytes
            const input24k = Buffer.alloc(4800);
            for (let i = 0; i < 2400; i++) {
                input24k.writeInt16LE(Math.round(Math.sin(i * 0.1) * 10000), i * 2);
            }

            const output16k = resample24kTo16k(input24k);
            // Expected output samples: 2400 * 2 / 3 = 1600 samples = 3200 bytes
            expect(output16k.length).toBe(3200);
        });
    });

    describe('VadResampler', () => {
        it('detects voice transitions and triggers speech callbacks', () => {
            const vad = new VadResampler({
                energyThreshold: 0.01,
                speechFramesRequired: 1,
                silenceFramesRequired: 2,
            });

            let speechStarted = false;
            let speechEndedData = null;

            vad.onSpeechStart = () => {
                speechStarted = true;
            };
            vad.onSpeechEnd = buf => {
                speechEndedData = buf;
            };

            // Send voice frame (high energy, 24000 samples for long buffer)
            const voiceChunk = Buffer.alloc(24000);
            for (let i = 0; i < 12000; i++) {
                voiceChunk.writeInt16LE(15000, i * 2);
            }

            vad.processAudio(voiceChunk);
            expect(speechStarted).toBe(true);

            // Send silence frames
            const silenceChunk = Buffer.alloc(4800);
            vad.processAudio(silenceChunk);
            vad.processAudio(silenceChunk);

            expect(speechEndedData).not.toBeNull();
            expect(speechEndedData.length).toBeGreaterThan(0);
        });
    });
});
