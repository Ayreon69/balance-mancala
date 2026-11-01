// Sons synthétisés (Web Audio), aucun fichier à charger : pions de bois dans des coupelles de faïence, cloches de l'Ange, grondement du Diable.
import type { Tint } from '../../../shared/protocol';
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t0 + (opts.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType; q?: number; fade?: number; sweep?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = opts.fade ?? 2;
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** fade;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2400, t0);
  if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
  if (opts.q) filter.Q.value = opts.q;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

/** Un pion de bois qui tombe dans une coupelle de faïence : un choc sourd, puis la coupelle qui tinte. */
function clink(delay = 0, pitch = 1, gain = 1): void {
  noise(0.035, { gain: 0.22 * gain, freq: 1500 * pitch, q: 2, fade: 5, delay });
  tone(1760 * pitch, 0.22, { type: 'sine', gain: 0.035 * gain, delay });
  tone(2637 * pitch, 0.14, { type: 'sine', gain: 0.016 * gain, delay: delay + 0.004 });
}

const TINT_NOTE: Record<Tint, number> = { red: 392, blue: 493.88, green: 587.33 };

export const sfx = {
  /** Un pion choisi dans la poignée. */
  tap: () => tone(700, 0.05, { gain: 0.025, type: 'triangle', slide: 1.3 }),
  /** Un pion posé pendant la mise en place. */
  place: () => clink(0, 0.9, 1),
  /** La poignée ramassée. */
  scoop: () => {
    for (let i = 0; i < 3; i++) noise(0.04, { gain: 0.12, freq: 1100 + i * 300, q: 2, fade: 4, delay: i * 0.035 });
  },
  /** Un pion qui tombe pendant le semis : la note monte d'une coupelle à l'autre. */
  drop: (i: number) => clink(0, 0.85 + Math.min(i, 10) * 0.045, 0.9),
  /** Le dernier pion marque : une note à la couleur, plus riche quand c'est pour moi. */
  score: (tint: Tint | null, mine: boolean) => {
    const f = tint ? TINT_NOTE[tint] : 440;
    tone(f, 0.5, { type: 'triangle', gain: mine ? 0.07 : 0.04 });
    tone(f * 1.5, 0.45, { type: 'sine', gain: mine ? 0.035 : 0.02, delay: 0.07 });
    if (mine) tone(f * 2, 0.6, { type: 'sine', gain: 0.03, delay: 0.14 });
  },
  /** L'Ange : des clochettes qui montent. */
  angel: () => {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, 0.7, { type: 'sine', gain: 0.035, delay: i * 0.08 }));
  },
  /** Le Diable : un grondement qui descend. */
  devil: () => {
    tone(110, 0.9, { type: 'sawtooth', gain: 0.04, slide: 0.6 });
    tone(116.5, 0.9, { type: 'square', gain: 0.02, slide: 0.6 });
    noise(0.8, { gain: 0.16, freq: 220, sweep: 70, type: 'lowpass', fade: 1.2 });
  },
  /** À toi de jouer : deux notes de cloche. */
  turn: () => {
    tone(784, 0.35, { type: 'sine', gain: 0.045 });
    tone(1046.5, 0.45, { type: 'sine', gain: 0.04, delay: 0.13 });
  },
  /** Fin de partie : modeste ou triomphale. */
  fanfare: (good: boolean) => {
    const notes = good ? [523.25, 659.25, 783.99, 659.25, 783.99, 1046.5] : [392, 349.23, 311.13, 261.63];
    notes.forEach((f, i) => tone(f, i === notes.length - 1 ? 0.9 : 0.2, { type: 'triangle', gain: 0.06, delay: i * 0.13 }));
  },
  /** Début de partie : les lames qu'on bat. */
  start: () => {
    for (let i = 0; i < 7; i++) noise(0.06, { gain: 0.1, freq: 2600 + Math.random() * 1800, q: 1.2, delay: i * 0.055 + Math.random() * 0.02, fade: 2.5 });
  },
};
