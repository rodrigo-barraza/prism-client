/**
 * AudioPlayerService — Real-time PCM audio playback via Web Audio API.
 *
 * Handles streaming PCM audio chunks from the Gemini Live API,
 * decoding base64 data to Float32 samples, and scheduling them
 * for gapless playback through an AudioContext.
 *
 * Also accumulates raw PCM data so a complete WAV blob can be
 * produced once the stream finishes.
 */

const DEFAULT_SAMPLE_RATE = 24000; // Gemini Live API outputs 24kHz

export default class AudioPlayerService {
  audioContext: any = null;
  nextStartTime: number = 0;
  isPlaying: boolean = false;
  pcmChunks: any[] = [];
  sampleRate: number = DEFAULT_SAMPLE_RATE;

  constructor() {
    this.audioContext = null;
    this.nextStartTime = 0;
    this.isPlaying = false;
    /** @type {Uint8Array[]} accumulated raw PCM bytes for WAV export */
    this.pcmChunks = [];
    this.sampleRate = DEFAULT_SAMPLE_RATE;
  }

  /**
   * Initialize the AudioContext (must be called from a user gesture context).
   */
  init() {
    if (!(this as any).audioContext) {
      (this as any).audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )({
        sampleRate: DEFAULT_SAMPLE_RATE,
      });
    }
    if ((this as any).audioContext.state === "suspended") {
      (this as any).audioContext.resume();
    }
    (this as any).nextStartTime = 0;
    (this as any).isPlaying = true;
    (this as any).pcmChunks = [];
  }

  /**
   * Parse the sample rate from a mimeType string like "audio/pcm;rate=24000".
   */
  parseSampleRate(mimeType: any) {
    if (!mimeType) return DEFAULT_SAMPLE_RATE;
    const match = mimeType.match(/rate=(\d+)/);
    return match ? parseInt(match[1], 10) : DEFAULT_SAMPLE_RATE;
  }

  /**
   * Enqueue a base64-encoded PCM audio chunk for playback.


   */
  enqueue(base64Data: any, mimeType: any) {
    if (!(this as any).audioContext || !(this as any).isPlaying) return;
    if (!base64Data || base64Data.length < 4) return;

    (this as any).sampleRate = this.parseSampleRate(mimeType);

    // Decode base64 → binary → Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Accumulate for WAV export
    (this as any).pcmChunks.push(bytes);

    // Convert Int16 → Float32 for Web Audio
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    if (float32.length === 0) return;

    // Create AudioBuffer and schedule
    const buffer = (this as any).audioContext.createBuffer(
      1,
      float32.length,
      (this as any).sampleRate,
    );
    buffer.copyToChannel(float32, 0);

    const source = (this as any).audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect((this as any).audioContext.destination);

    const now = (this as any).audioContext.currentTime;
    const startTime = Math.max(now, (this as any).nextStartTime);
    source.start(startTime);
    (this as any).nextStartTime = startTime + buffer.duration;
  }

  /**
   * Build a WAV Blob from all accumulated PCM chunks.
   * @returns {Blob|null} WAV blob or null if no data
   */
  buildWavBlob() {
    if ((this as any).pcmChunks.length === 0) return null;

    // Concatenate all PCM bytes
    const totalLength = (this as any).pcmChunks.reduce((sum: any, c: any) => sum + c.length, 0);
    const pcmData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of (this as any).pcmChunks) {
      pcmData.set(chunk, offset);
      offset += chunk.length;
    }

    // Build WAV header (44 bytes) + PCM data
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (this as any).sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    const headerSize = 44;

    const wav = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(wav);

    // RIFF header
    this.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, "WAVE");
    // fmt subchunk
    this.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // PCM
    view.setUint16(20, 1, true); // AudioFormat = PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, (this as any).sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    // data subchunk
    this.writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // Copy PCM data after header
    new Uint8Array(wav, headerSize).set(pcmData);

    return new Blob([wav], { type: "audio/wav" });
  }

  /**
   * Build a WAV Blob URL. Returns null if no data.

   */
  buildWavUrl() {
    const blob = this.buildWavBlob();
    return blob ? URL.createObjectURL(blob) : null;
  }

  /** Write a string into a DataView at a given offset. */
  writeString(view: any, offset: any, str: any) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /**
   * Stop playback and reset.
   */
  stop() {
    (this as any).isPlaying = false;
    (this as any).nextStartTime = 0;
    (this as any).pcmChunks = [];
    if ((this as any).audioContext) {
      (this as any).audioContext.close().catch(() => {});
      (this as any).audioContext = null;
    }
  }

  /**
   * Reset the scheduler for a new turn (keeps AudioContext alive).
   */
  reset() {
    (this as any).nextStartTime = 0;
    (this as any).pcmChunks = [];
  }
}
