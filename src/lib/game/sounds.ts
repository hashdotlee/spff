// Web Audio API Synthesizer for ShopeeFood Game
// 100% client-side, zero external dependencies or network assets

let audioCtx: AudioContext | null = null;
let isSoundEnabled = true;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function setSoundEnabled(enabled: boolean) {
  isSoundEnabled = enabled;
}

export function getSoundEnabled(): boolean {
  return isSoundEnabled;
}

/**
 * Characteristic bouncy ShopeeFood incoming order chime
 */
export function playShopeeRing() {
  if (!isSoundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [
    { freq: 659.25, time: 0, dur: 0.12 }, // E5
    { freq: 830.61, time: 0.12, dur: 0.12 }, // G#5
    { freq: 987.77, time: 0.24, dur: 0.14 }, // B5
    { freq: 1318.51, time: 0.38, dur: 0.35 }, // E6
  ];

  notes.forEach((n) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.time);

    gain.gain.setValueAtTime(0.001, ctx.currentTime + n.time);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + n.time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.time + n.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + n.time);
    osc.stop(ctx.currentTime + n.time + n.dur + 0.05);
  });
}

/**
 * Order accepted rising sound
 */
export function playAcceptSound() {
  if (!isSoundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.22);
}

/**
 * Order rejected decline buzz
 */
export function playRejectSound() {
  if (!isSoundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.18);

  gain.gain.setValueAtTime(0.18, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.22);
}

/**
 * Penalty alert siren (3 rejections / 40 min penalty)
 */
export function playPenaltySound() {
  if (!isSoundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  [0, 0.2, 0.4].forEach((offset) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime + offset);
    osc.frequency.linearRampToValueAtTime(329.63, ctx.currentTime + offset + 0.14);

    gain.gain.setValueAtTime(0.25, ctx.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + offset);
    osc.stop(ctx.currentTime + offset + 0.18);
  });
}

/**
 * Cash register / coin payout sound on successful delivery
 */
export function playCashKachingSound() {
  if (!isSoundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Two coin pings
  [
    { freq: 1046.5, time: 0, dur: 0.15 },
    { freq: 1567.98, time: 0.08, dur: 0.35 },
    { freq: 2093.0, time: 0.14, dur: 0.45 },
  ].forEach((coin) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(coin.freq, ctx.currentTime + coin.time);

    gain.gain.setValueAtTime(0.2, ctx.currentTime + coin.time);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + coin.time + coin.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + coin.time);
    osc.stop(ctx.currentTime + coin.time + coin.dur + 0.05);
  });
}

/**
 * Sad game over tones
 */
export function playGameOverSound() {
  if (!isSoundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [
    { freq: 392.0, time: 0 },
    { freq: 349.23, time: 0.25 },
    { freq: 311.13, time: 0.5 },
    { freq: 261.63, time: 0.8 },
  ];

  notes.forEach((n) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.time);

    gain.gain.setValueAtTime(0.18, ctx.currentTime + n.time);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.time + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + n.time);
    osc.stop(ctx.currentTime + n.time + 0.4);
  });
}

/**
 * Victory fanfare
 */
export function playVictorySound() {
  if (!isSoundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const chords = [
    { freqs: [523.25, 659.25, 783.99], time: 0, dur: 0.2 },
    { freqs: [587.33, 739.99, 880.0], time: 0.22, dur: 0.2 },
    { freqs: [659.25, 830.61, 987.77], time: 0.44, dur: 0.2 },
    { freqs: [783.99, 987.77, 1174.66], time: 0.66, dur: 0.5 },
  ];

  chords.forEach((c) => {
    c.freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + c.time);

      gain.gain.setValueAtTime(0.1, ctx.currentTime + c.time);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + c.time + c.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + c.time);
      osc.stop(ctx.currentTime + c.time + c.dur + 0.05);
    });
  });
}
