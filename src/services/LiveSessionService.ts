// ============================================================
// LiveSessionService — Manages persistent Live API sessions
// ============================================================
// Handles bidirectional audio/text streaming with Prism's /ws/live
// endpoint, which proxies to Google's Gemini Live API.
// ============================================================

import { PRISM_WS_URL, PROJECT_NAME } from "../../config.js";

const LIVE_WS_URL = `${PRISM_WS_URL}/ws/live?project=${PROJECT_NAME}`;

/**
 * Singleton-like service for managing a Live API WebSocket session.
 *
 * Usage:
 *   const session = new LiveSessionService();
 *   session.connect({ model, config, callbacks });
 *   session.startMicrophone();   // begins capturing audio
 *   session.stopMicrophone();
 *   session.sendText("Hello");
 *   session.disconnect();
 */
export default class LiveSessionService {
  constructor() {
    // @ts-ignore
    this.ws = null;
    // @ts-ignore
    this.audioContext = null; // Capture context (16kHz)
    // @ts-ignore
    this.playbackContext = null; // Playback context (24kHz)
    // @ts-ignore
    this.playbackWorkletNode = null; // Persistent playback worklet
    // @ts-ignore
    this.mediaStream = null;
    // @ts-ignore
    this.audioWorkletNode = null;
    // @ts-ignore
    this.isRecording = false;
    // @ts-ignore
    this.callbacks = {};
    // @ts-ignore
    this.connected = false;
  }

  // -- Connection ---------------------------------------------

  /**
   * Connect to Prism's /ws/live and set up a Live API session.
   * @param {object} params
   * @param {string} params.model - e.g. "gemini-3.1-flash-live-preview"
   * @param {object} [params.config] - Live API config (responseModalities, systemInstruction, etc.)
   * @param {object} params.callbacks - { onSetupComplete, onAudio, onText, onThinking, onToolCall, onInputTranscription, onOutputTranscription, onTurnComplete, onInterrupted, onError, onClose }
   */
  // @ts-ignore
  connect({ model: any, config = {}, callbacks = {} }) {
    // @ts-ignore
    this.callbacks = callbacks;

    // @ts-ignore
    if (this.ws) {
      this.disconnect();
    }

    // @ts-ignore
    this.ws = new WebSocket(LIVE_WS_URL);

    // @ts-ignore
    this.ws.onopen = () => {
      // Send setup message to initialize the Live API session
      // @ts-ignore
      this.ws.send(
        JSON.stringify({
          type: "setup",
          // @ts-ignore
          model,
          config,
        }),
      );
    };

    // @ts-ignore
    this.ws.onmessage = (event: any) => {
      const data = JSON.parse(event.data);
      this._handleMessage(data);
    };

    // @ts-ignore
    this.ws.onerror = (event: any) => {
      console.error("[LiveSession] WebSocket error:", event);
      // @ts-ignore
      if (this.callbacks.onError) {
        // @ts-ignore
        this.callbacks.onError("WebSocket connection error");
      }
    };

    // @ts-ignore
    this.ws.onclose = () => {
      // @ts-ignore
      this.connected = false;
      // @ts-ignore
      if (this.callbacks.onClose) {
        // @ts-ignore
        this.callbacks.onClose();
      }
    };
  }

  _handleMessage(data: any) {
    switch (data.type) {
      case "setupComplete":
        // @ts-ignore
        this.connected = true;
        // @ts-ignore
        // @ts-ignore
        if (this.callbacks.onSetupComplete) this.callbacks.onSetupComplete();
        break;

      case "audio":
        // @ts-ignore
        if (this.callbacks.onAudio) {
          // @ts-ignore
          this.callbacks.onAudio(data.data, data.mimeType);
        }
        // Auto-play audio if audio context exists
        this._playAudioChunk(data.data);
        break;

      case "text":
        // @ts-ignore
        // @ts-ignore
        if (this.callbacks.onText) this.callbacks.onText(data.text);
        break;

      case "thinking":
        // @ts-ignore
        // @ts-ignore
        if (this.callbacks.onThinking) this.callbacks.onThinking(data.content);
        break;

      case "toolCall":
        // @ts-ignore
        if (this.callbacks.onToolCall)
          // @ts-ignore
          this.callbacks.onToolCall(data.functionCalls);
        break;

      case "tool_execution":
        // @ts-ignore
        if (this.callbacks.onToolExecution) {
          // @ts-ignore
          this.callbacks.onToolExecution(data);
        }
        break;

      case "tool_output":
        // @ts-ignore
        if (this.callbacks.onToolOutput) {
          // @ts-ignore
          this.callbacks.onToolOutput(data);
        }
        break;

      case "inputTranscription":
        // @ts-ignore
        if (this.callbacks.onInputTranscription) {
          // @ts-ignore
          this.callbacks.onInputTranscription(data.text);
        }
        break;

      case "outputTranscription":
        // @ts-ignore
        if (this.callbacks.onOutputTranscription) {
          // @ts-ignore
          this.callbacks.onOutputTranscription(data.text);
        }
        break;

      case "userAudioReady":
        // @ts-ignore
        if (this.callbacks.onUserAudioReady) {
          // @ts-ignore
          this.callbacks.onUserAudioReady(data.userAudioRef);
        }
        break;

      case "turnComplete":
        // @ts-ignore
        // @ts-ignore
        if (this.callbacks.onTurnComplete) this.callbacks.onTurnComplete(data);
        break;

      case "interrupted":
        this.stopAudioPlayback();
        // @ts-ignore
        // @ts-ignore
        if (this.callbacks.onInterrupted) this.callbacks.onInterrupted(data);
        break;

      case "usage":
        // @ts-ignore
        // @ts-ignore
        if (this.callbacks.onUsage) this.callbacks.onUsage(data.usage);
        break;

      case "error":
        // @ts-ignore
        // @ts-ignore
        if (this.callbacks.onError) this.callbacks.onError(data.message);
        break;

      case "sessionClosed":
        // @ts-ignore
        this.connected = false;
        // @ts-ignore
        // @ts-ignore
        if (this.callbacks.onClose) this.callbacks.onClose();
        break;
    }
  }

  disconnect() {
    this.stopMicrophone();
    this.stopAudioPlayback();
    // @ts-ignore
    if (this.ws) {
      // @ts-ignore
      if (this.ws.readyState === WebSocket.OPEN) {
        // @ts-ignore
        this.ws.send(JSON.stringify({ type: "close" }));
      }
      // @ts-ignore
      this.ws.close();
      // @ts-ignore
      this.ws = null;
    }
    // @ts-ignore
    if (this.audioContext) {
      // @ts-ignore
      this.audioContext.close();
      // @ts-ignore
      this.audioContext = null;
    }
    // @ts-ignore
    if (this.playbackWorkletNode) {
      // @ts-ignore
      this.playbackWorkletNode.disconnect();
      // @ts-ignore
      this.playbackWorkletNode.port.close();
      // @ts-ignore
      this.playbackWorkletNode = null;
    }
    // @ts-ignore
    if (this.playbackContext) {
      // @ts-ignore
      this.playbackContext.close();
      // @ts-ignore
      this.playbackContext = null;
    }
    // @ts-ignore
    this._playbackInitPromise = null;
    // @ts-ignore
    this.connected = false;
  }

  // -- Input --------------------------------------------------

  sendText(text: any) {
    // @ts-ignore
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.stopAudioPlayback();
      // @ts-ignore
      this.ws.send(JSON.stringify({ type: "text", text }));
    }
  }

  sendToolResponse(responses: any) {
    // @ts-ignore
    if (this.ws?.readyState === WebSocket.OPEN) {
      // @ts-ignore
      this.ws.send(JSON.stringify({ type: "toolResponse", responses }));
    }
  }

  // -- Microphone ---------------------------------------------

  async startMicrophone() {
    // @ts-ignore
    if (this.isRecording) return;

    try {
      // Initialize AudioContext at 16kHz — Gemini's native input rate.
      // The browser handles hardware resampling from the mic's native
      // rate (typically 48kHz) down to 16kHz using a high-quality
      // polyphase resampler, eliminating manual downsampling.
      // @ts-ignore
      if (!this.audioContext) {
        // @ts-ignore
        this.audioContext = new (
          // @ts-ignore
          window.AudioContext || window.webkitAudioContext
        )({
          sampleRate: 16000,
        });
        // @ts-ignore
        await this.audioContext.audioWorklet.addModule("/pcm-processor.js");
      }

      // @ts-ignore
      if (this.audioContext.state === "suspended") {
        // @ts-ignore
        await this.audioContext.resume();
      }

      // Get microphone stream with WebRTC audio processing
      // @ts-ignore
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // @ts-ignore
      const source = this.audioContext.createMediaStreamSource(
        // @ts-ignore
        this.mediaStream,
      );
      // @ts-ignore
      this.audioWorkletNode = new AudioWorkletNode(
        // @ts-ignore
        this.audioContext,
        "pcm-processor",
      );

      // @ts-ignore
      this.audioWorkletNode.port.onmessage = (event: any) => {
        // @ts-ignore
        if (!this.isRecording) return;

        // Already at 16kHz from the AudioContext — convert Float32 → Int16 PCM
        const pcm16 = this._convertFloat32ToInt16(event.data);

        // Send as base64 to Prism
        const base64 = this._arrayBufferToBase64(pcm16);
        // @ts-ignore
        if (this.ws?.readyState === WebSocket.OPEN) {
          // @ts-ignore
          this.ws.send(
            JSON.stringify({
              type: "audio",
              data: base64,
              mimeType: "audio/pcm;rate=16000",
            }),
          );
        }
      };

      // Connect mic → worklet (no output connection — prevents echo)
      // @ts-ignore
      source.connect(this.audioWorkletNode);

      // @ts-ignore
      this.isRecording = true;
    } catch (error) {
      // @ts-ignore
      console.error("[LiveSession] Microphone error:", err);
      throw error;
    }
  }

  stopMicrophone() {
    // @ts-ignore
    this.isRecording = false;
    // @ts-ignore
    if (this.mediaStream) {
      // @ts-ignore
      this.mediaStream.getTracks().forEach((t: any) => t.stop());
      // @ts-ignore
      this.mediaStream = null;
    }
    // @ts-ignore
    if (this.audioWorkletNode) {
      // Flush any remaining samples in the worklet's 512-sample buffer
      // @ts-ignore
      this.audioWorkletNode.port.postMessage("flush");
      // @ts-ignore
      this.audioWorkletNode.disconnect();
      // @ts-ignore
      this.audioWorkletNode.port.close();
      // @ts-ignore
      this.audioWorkletNode = null;
    }
    // Signal the Live API to flush any server-side cached audio
    // @ts-ignore
    if (this.ws?.readyState === WebSocket.OPEN) {
      // @ts-ignore
      this.ws.send(JSON.stringify({ type: "audioStreamEnd" }));
    }
  }

  // -- Audio Playback -----------------------------------------

  // Lazily create a dedicated 24kHz playback context with a persistent
  // AudioWorklet. The worklet maintains a ring buffer queue on the audio
  // thread — zero GC pressure, instant interrupt via single message.
  // Uses a memoized promise to prevent race conditions during init.
  _ensurePlaybackContext() {
    // @ts-ignore
    if (!this._playbackInitPromise) {
      // @ts-ignore
      this._playbackInitPromise = (async () => {
        // @ts-ignore
        this.playbackContext = new (
          // @ts-ignore
          window.AudioContext || window.webkitAudioContext
        )({
          sampleRate: 24000,
        });
        // @ts-ignore
        await this.playbackContext.audioWorklet.addModule(
          "/playback-processor.js",
        );
        // @ts-ignore
        this.playbackWorkletNode = new AudioWorkletNode(
          // @ts-ignore
          this.playbackContext,
          "playback-processor",
        );
        // @ts-ignore
        // @ts-ignore
        this.playbackWorkletNode.connect(this.playbackContext.destination);
      })();
    }
    // @ts-ignore
    return this._playbackInitPromise;
  }

  async _playAudioChunk(base64Data: any) {
    await this._ensurePlaybackContext();

    // @ts-ignore
    if (this.playbackContext.state === "suspended") {
      // @ts-ignore
      await this.playbackContext.resume();
    }

    try {
      // Decode base64 → Int16 PCM → Float32
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const pcmData = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32[i] = pcmData[i] / 32768.0;
      }

      // Post directly to the worklet's ring buffer queue
      // @ts-ignore
      this.playbackWorkletNode.port.postMessage(float32);
    } catch (error) {
      // @ts-ignore
      console.error("[LiveSession] Audio playback error:", err);
    }
  }

  stopAudioPlayback() {
    // @ts-ignore
    if (this.playbackWorkletNode) {
      // @ts-ignore
      this.playbackWorkletNode.port.postMessage("interrupt");
    }
  }

  // -- Audio Utils --------------------------------------------

  _convertFloat32ToInt16(buffer: any) {
    const buf = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      buf[i] = Math.min(1, Math.max(-1, buffer[i])) * 0x7fff;
    }
    return buf.buffer;
  }

  _arrayBufferToBase64(buffer: any) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
