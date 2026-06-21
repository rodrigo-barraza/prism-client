/**
 * SoundService — Procedural UI sound synthesis via Web Audio API.
 *
 * Generates tiny, GPU-friendly audio cues (hover ticks, clicks, etc.)
 * entirely in-memory using shaped noise buffers and sine sweeps.
 * No external audio files required.
 *
 * Stereo control: each play call accepts independent left/right
 * gain values (0–100) routed through a ChannelSplitter → per-channel
 * GainNode → ChannelMerger topology.
 */

// --- Types --------------------------------------------------

interface StereoOptions {
  event?: Event;
  left?: number;
  right?: number;
}

interface SpatialResult {
  left: number;
  right: number;
}

// --- State --------------------------------------------------

let context: AudioContext | null = null;

/** Cached hover noise buffer */
let hoverBuffer: AudioBuffer | null = null;

/** Cached click buffer */
let clickBuffer: AudioBuffer | null = null;

/** Cached button hover buffer */
let buttonHoverBuffer: AudioBuffer | null = null;

/** Cached button click buffer */
let buttonClickBuffer: AudioBuffer | null = null;

/** Cached generation-start beep buffer (higher pitch) */
let generationStartBuffer: AudioBuffer | null = null;

/** Cached generation-end beep buffer (lower pitch) */
let generationEndBuffer: AudioBuffer | null = null;

/**
 * Lazily initialise the shared AudioContext.
 * Must be called from a user-gesture context on first invocation.
 */
function ensureContext(): AudioContext {
  if (!context) {
    context = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
  }
  if (context.state === "suspended") {
    context.resume();
  }
  return context;
}

// --- Sound generators ----------------------------------------------

/**
 * Build (or return cached) a mono AudioBuffer containing a very
 * short filtered-noise hover tick.
 *
 * Technique: white noise → rapid exponential decay envelope.
 * Duration ~12 ms — imperceptibly brief, but enough for a
 * satisfying tactile "tick".
 */
function getHoverBuffer(): AudioBuffer {
  if (hoverBuffer) return hoverBuffer;

  const audio = ensureContext();
  const sampleRate = audio.sampleRate;
  const duration = 0.012; // 12 ms
  const length = Math.ceil(sampleRate * duration);

  hoverBuffer = audio.createBuffer(1, length, sampleRate);
  const data = hoverBuffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const tool = i / sampleRate;
    // White noise shaped by a steep exponential decay
    const noise = Math.random() * 2 - 1;
    const envelope = Math.exp(-tool * 600);
    data[i] = noise * envelope * 0.025; // ultra-quiet base amplitude
  }

  return hoverBuffer;
}

/**
 * Build (or return cached) a mono AudioBuffer for a satisfying click.
 *
 * Technique: descending sine sweep (1800 → 400 Hz) layered with a
 * noise transient. The pitch drop gives it a "plop/pop" character
 * that feels tactile and premium. Slightly louder than the hover tick.
 * Duration ~25 ms.
 */
function getClickBuffer(): AudioBuffer {
  if (clickBuffer) return clickBuffer;

  const audio = ensureContext();
  const sampleRate = audio.sampleRate;
  const duration = 0.025; // 25 ms
  const length = Math.ceil(sampleRate * duration);

  clickBuffer = audio.createBuffer(1, length, sampleRate);
  const data = clickBuffer.getChannelData(0);

  const freqStart = 1800;
  const freqEnd = 400;

  let phase = 0;

  for (let i = 0; i < length; i++) {
    const tool = i / sampleRate;
    const progress = i / length;

    // Exponential frequency sweep from high → low
    const freq = freqStart * Math.pow(freqEnd / freqStart, progress);

    // Accumulate phase for smooth sine wave
    phase += (2 * Math.PI * freq) / sampleRate;

    // Sine body with steep exponential decay
    const sine = Math.sin(phase) * Math.exp(-tool * 300);

    // Noise transient layer — only the first ~5 ms
    const noiseAmt = Math.exp(-tool * 800);
    const noise = (Math.random() * 2 - 1) * noiseAmt * 0.3;

    // Combined — ~2× louder than hover tick
    data[i] = sine * 0.06 + noise * 0.02;
  }

  return clickBuffer;
}

/**
 * Build (or return cached) a mono AudioBuffer for a soft button
 * hover ping — a brief, pure sine tone at 2400 Hz with a fast
 * exponential decay. Feels like a light "blip" — cleaner and
 * more tonal than the general-purpose noise tick.
 * Duration ~15 ms.
 */
function getButtonHoverBuffer(): AudioBuffer {
  if (buttonHoverBuffer) return buttonHoverBuffer;

  const audio = ensureContext();
  const sampleRate = audio.sampleRate;
  const duration = 0.015; // 15 ms
  const length = Math.ceil(sampleRate * duration);

  buttonHoverBuffer = audio.createBuffer(1, length, sampleRate);
  const data = buttonHoverBuffer.getChannelData(0);

  const freq = 2400;

  for (let i = 0; i < length; i++) {
    const tool = i / sampleRate;
    const sine = Math.sin(2 * Math.PI * freq * tool);
    const envelope = Math.exp(-tool * 500);
    data[i] = sine * envelope * 0.03;
  }

  return buttonHoverBuffer;
}

/**
 * Build (or return cached) a mono AudioBuffer for a punchy button
 * click — a two-tone chord (900 + 1350 Hz, a perfect fifth) with
 * a descending pitch bend and noise transient. Gives a satisfying,
 * rich "snap" that feels intentional and premium.
 * Duration ~30 ms.
 */
function getButtonClickBuffer(): AudioBuffer {
  if (buttonClickBuffer) return buttonClickBuffer;

  const audio = ensureContext();
  const sampleRate = audio.sampleRate;
  const duration = 0.03; // 30 ms
  const length = Math.ceil(sampleRate * duration);

  buttonClickBuffer = audio.createBuffer(1, length, sampleRate);
  const data = buttonClickBuffer.getChannelData(0);

  const baseFreq = 900;
  const fifthFreq = 1350; // perfect fifth
  let phaseA = 0;
  let phaseB = 0;

  for (let i = 0; i < length; i++) {
    const tool = i / sampleRate;
    const progress = i / length;

    // Slight downward pitch bend
    const bend = 1 - progress * 0.15;
    const freqA = baseFreq * bend;
    const freqB = fifthFreq * bend;

    phaseA += (2 * Math.PI * freqA) / sampleRate;
    phaseB += (2 * Math.PI * freqB) / sampleRate;

    const toneA = Math.sin(phaseA) * 0.5;
    const toneB = Math.sin(phaseB) * 0.3;
    const envelope = Math.exp(-tool * 200);

    // Noise transient — first ~8 ms
    const noiseAmt = Math.exp(-tool * 600);
    const noise = (Math.random() * 2 - 1) * noiseAmt * 0.2;

    data[i] = ((toneA + toneB) * envelope + noise) * 0.05;
  }

  return buttonClickBuffer;
}

// --- Generation lifecycle beep generators ------------------------------

/**
 * Build (or return cached) a mono AudioBuffer for a gentle ascending
 * sine beep — played when generation starts.
 *
 * Technique: sine sweep from 880 → 1100 Hz (rising pitch) with a
 * smooth exponential decay. Duration ~80 ms — subtle and non-intrusive.
 */
function getGenerationStartBuffer(): AudioBuffer {
  if (generationStartBuffer) return generationStartBuffer;

  const audio = ensureContext();
  const sampleRate = audio.sampleRate;
  const duration = 0.08;
  const length = Math.ceil(sampleRate * duration);

  generationStartBuffer = audio.createBuffer(1, length, sampleRate);
  const data = generationStartBuffer.getChannelData(0);

  const frequencyStart = 880;
  const frequencyEnd = 1100;
  let phase = 0;

  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    const progress = i / length;

    const frequency =
      frequencyStart + (frequencyEnd - frequencyStart) * progress;
    phase += (2 * Math.PI * frequency) / sampleRate;

    const sine = Math.sin(phase);
    const envelope = Math.exp(-time * 40) * (1 - Math.pow(progress, 3));

    data[i] = sine * envelope * 0.04;
  }

  return generationStartBuffer;
}

/**
 * Build (or return cached) a mono AudioBuffer for a gentle descending
 * sine beep — played when generation ends.
 *
 * Technique: sine sweep from 660 → 440 Hz (falling pitch) with a
 * longer exponential tail. Duration ~100 ms — a satisfying soft chime
 * signaling completion.
 */
function getGenerationEndBuffer(): AudioBuffer {
  if (generationEndBuffer) return generationEndBuffer;

  const audio = ensureContext();
  const sampleRate = audio.sampleRate;
  const duration = 0.1;
  const length = Math.ceil(sampleRate * duration);

  generationEndBuffer = audio.createBuffer(1, length, sampleRate);
  const data = generationEndBuffer.getChannelData(0);

  const frequencyStart = 660;
  const frequencyEnd = 440;
  let phase = 0;

  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    const progress = i / length;

    const frequency =
      frequencyStart + (frequencyEnd - frequencyStart) * progress;
    phase += (2 * Math.PI * frequency) / sampleRate;

    const sine = Math.sin(phase);
    const envelope = Math.exp(-time * 30) * (1 - Math.pow(progress, 4));

    data[i] = sine * envelope * 0.04;
  }

  return generationEndBuffer;
}

// --- Stereo routing helper -----------------------------------------

/**
 * Route a source node through independent L/R gain stages and
 * connect to the destination.
 *
 * Topology:
 *   source → splitter(ch0) → gainL -┐
 *                                     ├→ merger → destination
 *   source → splitter(ch1) → gainR -┘
 *
 * Because the buffers are mono, the splitter outputs the same
 * signal on both channels. Each GainNode then scales independently
 * according to the caller's 0–100 value.
 */
function connectStereo(
  source: AudioBufferSourceNode,
  left: number,
  right: number,
): void {
  const audio = ensureContext();

  // Up-mix mono to stereo so the splitter has two channels
  const splitter = audio.createChannelSplitter(2);
  const merger = audio.createChannelMerger(2);

  const gainL = audio.createGain();
  const gainR = audio.createGain();

  gainL.gain.value = Math.max(0, Math.min(1, left / 100));
  gainR.gain.value = Math.max(0, Math.min(1, right / 100));

  // Source → splitter
  source.connect(splitter);

  // Splitter ch0 → gainL → merger ch0 (left)
  splitter.connect(gainL, 0);
  gainL.connect(merger, 0, 0);

  // Splitter ch1 → gainR → merger ch1 (right)
  splitter.connect(gainR, 0); // mono source only has ch0
  gainR.connect(merger, 0, 1);

  merger.connect(audio.destination);
}

// --- Spatial stereo helper -----------------------------------------

/**
 * Derive left/right speaker volumes (0–100) from an element's
 * horizontal center relative to the viewport width.
 *
 * Element at left edge  → { left: 100, right: 0 }
 * Element at center     → { left: 50,  right: 50 }
 * Element at right edge → { left: 0,   right: 100 }
 */
function spatialFromEvent(event: Event | undefined): SpatialResult {
  const element = (event as UIEvent | undefined)?.target as HTMLElement | null;
  const targetElement =
    element ??
    ((event as UIEvent | undefined)?.currentTarget as HTMLElement | null);
  if (!targetElement?.getBoundingClientRect) return { left: 50, right: 50 };

  const rect = targetElement.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const ratio = Math.max(0, Math.min(1, centerX / window.innerWidth));

  return {
    left: Math.round((1 - ratio) * 100),
    right: Math.round(ratio * 100),
  };
}

// --- Public API ----------------------------------------------------

const SoundService = {
  /**
   * Play the hover tick sound — ultra-quiet noise burst.
   *
   * By default, stereo is calculated from the event target's
   * position in the viewport. Pass explicit left/right to override.
   */
  playHover({ event, left, right }: StereoOptions = {}): void {
    const audio = ensureContext();
    const buffer = getHoverBuffer();
    const spatial = spatialFromEvent(event);

    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.85 + Math.random() * 0.3; // ±15% pitch variation

    connectStereo(source, left ?? spatial.left, right ?? spatial.right);
    source.start(0);
  },

  /**
   * Play the click sound — descending sine sweep + noise transient.
   * Slightly louder and punchier than the hover tick.
   *
   * By default, stereo is calculated from the event target's
   * position in the viewport. Pass explicit left/right to override.
   */
  playClick({ event, left, right }: StereoOptions = {}): void {
    const audio = ensureContext();
    const buffer = getClickBuffer();
    const spatial = spatialFromEvent(event);

    const source = audio.createBufferSource();
    source.buffer = buffer;

    connectStereo(source, left ?? spatial.left, right ?? spatial.right);
    source.start(0);
  },

  /**
   * Play the button hover sound — soft sine ping.
   */
  playHoverButton({ event, left, right }: StereoOptions = {}): void {
    const audio = ensureContext();
    const buffer = getButtonHoverBuffer();
    const spatial = spatialFromEvent(event);

    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.85 + Math.random() * 0.3; // ±15% pitch variation

    connectStereo(source, left ?? spatial.left, right ?? spatial.right);
    source.start(0);
  },

  /**
   * Play the button click sound — two-tone chord snap.
   */
  playClickButton({ event, left, right }: StereoOptions = {}): void {
    const audio = ensureContext();
    const buffer = getButtonClickBuffer();
    const spatial = spatialFromEvent(event);

    const source = audio.createBufferSource();
    source.buffer = buffer;

    connectStereo(source, left ?? spatial.left, right ?? spatial.right);
    source.start(0);
  },

  /**
   * Play a gentle ascending beep when generation starts.
   * Higher pitch (880→1100 Hz), centered stereo.
   */
  playGenerationStart(): void {
    const audio = ensureContext();
    const buffer = getGenerationStartBuffer();

    const source = audio.createBufferSource();
    source.buffer = buffer;

    connectStereo(source, 50, 50);
    source.start(0);
  },

  /**
   * Play a gentle descending beep when generation ends.
   * Lower pitch (660→440 Hz), centered stereo.
   */
  playGenerationEnd(): void {
    const audio = ensureContext();
    const buffer = getGenerationEndBuffer();

    const source = audio.createBufferSource();
    source.buffer = buffer;

    connectStereo(source, 50, 50);
    source.start(0);
  },

  /**
   * Returns `{ onClick, onMouseEnter }` event-handler props that play
   * the appropriate hover/click sounds with spatial stereo, then call
   * through to optional consumer callbacks.
   *
   * Usage:
   *   <div {...SoundService.interactive(() => navigate(id))}>
   */
  interactive(
    onClick?: (e: React.MouseEvent) => void,
    onMouseEnter?: (e: React.MouseEvent) => void,
  ): {
    onClick: (e: React.MouseEvent) => void;
    onMouseEnter: (e: React.MouseEvent) => void;
  } {
    return {
      onMouseEnter: (e: React.MouseEvent) => {
        SoundService.playHover({ event: e.nativeEvent });
        onMouseEnter?.(e);
      },
      onClick: (e: React.MouseEvent) => {
        SoundService.playClick({ event: e.nativeEvent });
        onClick?.(e);
      },
    };
  },

  /**
   * Tear down the AudioContext (e.g. on unmount / navigation).
   */
  dispose(): void {
    if (context) {
      context.close().catch(() => {});
      context = null;
    }
    hoverBuffer = null;
    clickBuffer = null;
    buttonHoverBuffer = null;
    buttonClickBuffer = null;
    generationStartBuffer = null;
    generationEndBuffer = null;
  },
};

export default SoundService;
