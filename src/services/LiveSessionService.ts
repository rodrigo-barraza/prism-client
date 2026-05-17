// @ts-nocheck
// ============================================================
// LiveSessionService — Manages persistent Live API sessions
// ============================================================
// Handles bidirectional audio/text streaming with Prism's /ws/live
// endpoint, which proxies to Google's Gemini Live API.
// ============================================================

import { PRISM_WS_URL, PROJECT_NAME } from "../../config";

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
    (this as any).ws = null;
    (this as any).audioContext = null; // Capture context (16kHz)
    (this as any).playbackContext = null; // Playback context (24kHz)
    (this as any).playbackWorkletNode = null; // Persistent playback worklet
    (this as any).mediaStream = null;
    (this as any).audioWorkletNode = null;
    (this as any).isRecording = false;
    (this as any).callbacks = {};
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
  connect({ model, config = {}, callbacks = {} }: any) {
    (this as any).callbacks = callbacks;

    if ((this as any).ws) {
      this.disconnect();
    }

    (this as any).ws = new WebSocket(LIVE_WS_URL);

    (this as any).ws.onopen = () => {
      // Send setup message to initialize the Live API session
      (this as any).ws.send(
        JSON.stringify({
          type: "setup",
          model,
          config,
        }),
      );
    };

    (this as any).ws.onmessage = (event: any) => {
      const data = JSON.parse(event.data);
      this._handleMessage(data);
    };

    (this as any).ws.onerror = (event: any) => {
      console.error("[LiveSession] WebSocket error:", event);
      if ((this as any).callbacks.onError) {
        (this as any).callbacks.onError("WebSocket connection error");
      }
    };

    (this as any).ws.onclose = () => {
      this.connected = false;
      if ((this as any).callbacks.onClose) {
        (this as any).callbacks.onClose();
      }
    };
  }

  _handleMessage(data: any) {
    switch (data.type) {
      case "setupComplete":
        this.connected = true;
        if ((this as any).callbacks.onSetupComplete) (this as any).callbacks.onSetupComplete();
        break;

      case "audio":
        if ((this as any).callbacks.onAudio) {
          (this as any).callbacks.onAudio(data.data, data.mimeType);
        }
        // Auto-play audio if audio context exists
        this._playAudioChunk(data.data);
        break;

      case "text":
        if ((this as any).callbacks.onText) (this as any).callbacks.onText(data.text);
        break;

      case "thinking":
        if ((this as any).callbacks.onThinking) (this as any).callbacks.onThinking(data.content);
        break;

      case "toolCall":
        if ((this as any).callbacks.onToolCall)
          (this as any).callbacks.onToolCall(data.functionCalls);
        break;

      case "tool_execution":
        if ((this as any).callbacks.onToolExecution) {
          (this as any).callbacks.onToolExecution(data);
        }
        break;

      case "tool_output":
        if ((this as any).callbacks.onToolOutput) {
          (this as any).callbacks.onToolOutput(data);
        }
        break;

      case "inputTranscription":
        if ((this as any).callbacks.onInputTranscription) {
          (this as any).callbacks.onInputTranscription(data.text);
        }
        break;

      case "outputTranscription":
        if ((this as any).callbacks.onOutputTranscription) {
          (this as any).callbacks.onOutputTranscription(data.text);
        }
        break;

      case "userAudioReady":
        if ((this as any).callbacks.onUserAudioReady) {
          (this as any).callbacks.onUserAudioReady(data.userAudioRef);
        }
        break;

      case "turnComplete":
        if ((this as any).callbacks.onTurnComplete) (this as any).callbacks.onTurnComplete(data);
        break;

      case "interrupted":
        this.stopAudioPlayback();
        if ((this as any).callbacks.onInterrupted) (this as any).callbacks.onInterrupted(data);
        break;

      case "usage":
        if ((this as any).callbacks.onUsage) (this as any).callbacks.onUsage(data.usage);
        break;

      case "error":
        if ((this as any).callbacks.onError) (this as any).callbacks.onError(data.message);
        break;

      case "sessionClosed":
        this.connected = false;
        if ((this as any).callbacks.onClose) (this as any).callbacks.onClose();
        break;
    }
  }

  disconnect() {
    this.stopMicrophone();
    this.stopAudioPlayback();
    if ((this as any).ws) {
      if ((this as any).ws.readyState === WebSocket.OPEN) {
        (this as any).ws.send(JSON.stringify({ type: "close" }));
      }
      (this as any).ws.close();
      (this as any).ws = null;
    }
    if ((this as any).audioContext) {
      (this as any).audioContext.close();
      (this as any).audioContext = null;
    }
    if ((this as any).playbackWorkletNode) {
      (this as any).playbackWorkletNode.disconnect();
      (this as any).playbackWorkletNode.port.close();
      (this as any).playbackWorkletNode = null;
    }
    if ((this as any).playbackContext) {
      (this as any).playbackContext.close();
      (this as any).playbackContext = null;
    }
    (this as any)._playbackInitPromise = null;
    this.connected = false;
  }

  // -- Input --------------------------------------------------

  sendText(text: any) {
    if ((this as any).ws?.readyState === WebSocket.OPEN) {
      this.stopAudioPlayback();
      (this as any).ws.send(JSON.stringify({ type: "text", text }));
    }
  }

  sendToolResponse(responses: any) {
    if ((this as any).ws?.readyState === WebSocket.OPEN) {
      (this as any).ws.send(JSON.stringify({ type: "toolResponse", responses }));
    }
  }

  // -- Microphone ---------------------------------------------

  async startMicrophone() {
    if ((this as any).isRecording) return;

    try {
      // Initialize AudioContext at 16kHz — Gemini's native input rate.
      // The browser handles hardware resampling from the mic's native
      // rate (typically 48kHz) down to 16kHz using a high-quality
      // polyphase resampler, eliminating manual downsampling.
      if (!(this as any).audioContext) {
        (this as any).audioContext = new (
          window.AudioContext || window.webkitAudioContext
        )({
          sampleRate: 16000,
        });
        await (this as any).audioContext.audioWorklet.addModule("/pcm-processor.js");
      }

      if ((this as any).audioContext.state === "suspended") {
        await (this as any).audioContext.resume();
      }

      // Get microphone stream with WebRTC audio processing
      (this as any).mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const source = (this as any).audioContext.createMediaStreamSource(
        (this as any).mediaStream,
      );
      (this as any).audioWorkletNode = new AudioWorkletNode(
        (this as any).audioContext,
        "pcm-processor",
      );

      (this as any).audioWorkletNode.port.onmessage = (event: any) => {
        if (!(this as any).isRecording) return;

        // Already at 16kHz from the AudioContext — convert Float32 → Int16 PCM
        const pcm16 = this._convertFloat32ToInt16(event.data);

        // Send as base64 to Prism
        const base64 = this._arrayBufferToBase64(pcm16);
        if ((this as any).ws?.readyState === WebSocket.OPEN) {
          (this as any).ws.send(
            JSON.stringify({
              type: "audio",
              data: base64,
              mimeType: "audio/pcm;rate=16000",
            }),
          );
        }
      };

      // Connect mic → worklet (no output connection — prevents echo)
      source.connect((this as any).audioWorkletNode);

      (this as any).isRecording = true;
    } catch (error: any) {
      console.error("[LiveSession] Microphone error:", err);
      throw error;
    }
  }

  stopMicrophone() {
    (this as any).isRecording = false;
    if ((this as any).mediaStream) {
      (this as any).mediaStream.getTracks().forEach((t: any) => t.stop());
      (this as any).mediaStream = null;
    }
    if ((this as any).audioWorkletNode) {
      // Flush any remaining samples in the worklet's 512-sample buffer
      (this as any).audioWorkletNode.port.postMessage("flush");
      (this as any).audioWorkletNode.disconnect();
      (this as any).audioWorkletNode.port.close();
      (this as any).audioWorkletNode = null;
    }
    // Signal the Live API to flush any server-side cached audio
    if ((this as any).ws?.readyState === WebSocket.OPEN) {
      (this as any).ws.send(JSON.stringify({ type: "audioStreamEnd" }));
    }
  }

  // -- Audio Playback -----------------------------------------

  // Lazily create a dedicated 24kHz playback context with a persistent
  // AudioWorklet. The worklet maintains a ring buffer queue on the audio
  // thread — zero GC pressure, instant interrupt via single message.
  // Uses a memoized promise to prevent race conditions during init.
  _ensurePlaybackContext() {
    if (!(this as any)._playbackInitPromise) {
      (this as any)._playbackInitPromise = (async () => {
        (this as any).playbackContext = new (
          window.AudioContext || window.webkitAudioContext
        )({
          sampleRate: 24000,
        });
        await (this as any).playbackContext.audioWorklet.addModule(
          "/playback-processor.js",
        );
        (this as any).playbackWorkletNode = new AudioWorkletNode(
          (this as any).playbackContext,
          "playback-processor",
        );
        (this as any).playbackWorkletNode.connect((this as any).playbackContext.destination);
      })();
    }
    return (this as any)._playbackInitPromise;
  }

  async _playAudioChunk(base64Data: any) {
    await this._ensurePlaybackContext();

    if ((this as any).playbackContext.state === "suspended") {
      await (this as any).playbackContext.resume();
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
      (this as any).playbackWorkletNode.port.postMessage(float32);
    } catch (error: any) {
      console.error("[LiveSession] Audio playback error:", err);
    }
  }

  stopAudioPlayback() {
    if ((this as any).playbackWorkletNode) {
      (this as any).playbackWorkletNode.port.postMessage("interrupt");
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
