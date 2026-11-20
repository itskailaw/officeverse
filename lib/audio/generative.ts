/**
 * Original background music, generated live with the Web Audio API — no audio files, no licences.
 * Each style is a chord loop + bass + soft drums + a wandering melody, with a gentle tape/vinyl colour.
 */

export type Style = "lofi" | "jazz" | "ambient" | "bossa";

interface StyleDef {
  label: string;
  bpm: number;
  /** chords as MIDI note numbers (voicing), one per bar */
  chords: number[][];
  drums: "lofi" | "brush" | "none" | "bossa";
  melody: number; // chance per 8th note
  swing: number; // 0..0.33
  crackle: number;
  pad: boolean;
}

// MIDI helpers: 60 = middle C
export const STYLES: Record<Style, StyleDef> = {
  lofi: {
    label: "Lo-fi office",
    bpm: 74,
    chords: [
      [53, 57, 60, 64], // Fmaj7
      [52, 55, 59, 62], // Em7
      [50, 53, 57, 60], // Dm7
      [48, 52, 55, 59], // Cmaj7
      [53, 57, 60, 64],
      [52, 55, 59, 62],
      [50, 53, 57, 62], // Dm9-ish
      [55, 59, 62, 65], // G7
    ],
    drums: "lofi",
    melody: 0.28,
    swing: 0.18,
    crackle: 1,
    pad: false,
  },
  jazz: {
    label: "Café jazz",
    bpm: 92,
    chords: [
      [50, 53, 57, 60], // Dm7
      [55, 59, 62, 65], // G7
      [48, 52, 55, 59], // Cmaj7
      [57, 61, 64, 67], // A7
      [50, 53, 57, 60],
      [55, 59, 62, 65],
      [52, 55, 59, 62], // Em7
      [57, 60, 64, 67], // Am7
    ],
    drums: "brush",
    melody: 0.34,
    swing: 0.28,
    crackle: 0.5,
    pad: false,
  },
  bossa: {
    label: "Sunny bossa",
    bpm: 108,
    chords: [
      [48, 52, 55, 59], // Cmaj7
      [50, 53, 57, 60], // Dm7
      [52, 55, 59, 62], // Em7
      [50, 53, 57, 60],
      [53, 57, 60, 64], // Fmaj7
      [52, 55, 59, 62],
      [50, 53, 57, 60],
      [55, 59, 62, 65], // G7
    ],
    drums: "bossa",
    melody: 0.22,
    swing: 0,
    crackle: 0.3,
    pad: false,
  },
  ambient: {
    label: "Deep focus",
    bpm: 60,
    chords: [
      [45, 52, 57, 60, 64], // Am(add9)
      [41, 48, 53, 57, 64], // Fmaj7
      [48, 55, 60, 64, 67], // C
      [43, 50, 55, 59, 62], // G
    ],
    drums: "none",
    melody: 0.12,
    swing: 0,
    crackle: 0.25,
    pad: true,
  },
};

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class GenerativeMusic {
  private ctx: AudioContext;
  private master: GainNode;
  private tone: BiquadFilterNode;
  private verb: ConvolverNode;
  private verbGain: GainNode;
  private noise: AudioBuffer;
  private crackleSrc: AudioBufferSourceNode | null = null;
  private crackleGain: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextTime = 0;
  private melodyNote = 72;
  private style: StyleDef;
  styleId: Style;

  constructor(ctx: AudioContext, out: AudioNode, style: Style) {
    this.ctx = ctx;
    this.styleId = style;
    this.style = STYLES[style];
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // warm, slightly muffled "tape" tone
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 3800;
    this.tone.Q.value = 0.4;
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.4);
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.22;
    this.master.connect(this.tone).connect(out);
    this.master.connect(this.verb).connect(this.verbGain).connect(this.tone);
    this.noise = this.noiseBuffer(2);
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    this.crackleGain.connect(out);
  }

  setStyle(style: Style) {
    this.styleId = style;
    this.style = STYLES[style];
    this.step = 0;
    this.crackleGain.gain.setTargetAtTime(0.018 * this.style.crackle, this.ctx.currentTime, 0.5);
  }

  start() {
    if (this.timer) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.9, t, 0.8);
    this.nextTime = t + 0.12;
    this.startCrackle();
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop(fade = 0.6) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, fade / 3);
    this.crackleGain.gain.setTargetAtTime(0, t, fade / 3);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const src = this.crackleSrc;
    this.crackleSrc = null;
    setTimeout(() => src?.stop(), fade * 1500);
  }

  // ───────────────────────── scheduler (16th notes)
  private schedule() {
    const sixteenth = 60 / this.style.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const s = this.step;
      // swing the off-beat 8ths
      const swing = s % 4 === 2 ? this.style.swing * sixteenth * 2 : 0;
      this.play(s, this.nextTime + swing, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  private play(s: number, t: number, sixteenth: number) {
    const st = this.style;
    const bar = Math.floor(s / 16);
    const inBar = s % 16;
    const chord = st.chords[bar % st.chords.length];
    const barLen = sixteenth * 16;

    // chords
    if (st.pad) {
      if (inBar === 0) chord.forEach((n, i) => this.pad(hz(n), t, barLen * 1.05, 0.05 - i * 0.004));
    } else if (st.drums === "bossa") {
      // syncopated comping
      if ([0, 3, 6, 10, 12].includes(inBar)) chord.forEach((n) => this.keys(hz(n), t, sixteenth * 2.2, 0.045));
    } else if (inBar === 0 || (inBar === 10 && bar % 2 === 1)) {
      chord.forEach((n, i) => this.keys(hz(n), t + i * 0.012, inBar === 0 ? barLen * 0.9 : barLen * 0.35, 0.05));
    }

    // bass
    const root = chord[0] - 12;
    if (st.drums === "none") {
      if (inBar === 0) this.bass(hz(root - 12), t, barLen, 0.16);
    } else if (st.drums === "brush") {
      // walking quarter notes
      if (inBar % 4 === 0) {
        const walk = [0, 4, 7, 5][inBar / 4];
        this.bass(hz(root + walk), t, sixteenth * 3.6, 0.2);
      }
    } else if (st.drums === "bossa") {
      if (inBar === 0 || inBar === 8) this.bass(hz(root), t, sixteenth * 3, 0.22);
      if (inBar === 6 || inBar === 14) this.bass(hz(root + 7), t, sixteenth * 2, 0.18);
    } else {
      if (inBar === 0) this.bass(hz(root), t, sixteenth * 6, 0.22);
      if (inBar === 7) this.bass(hz(root + 7), t, sixteenth * 2, 0.15);
      if (inBar === 10) this.bass(hz(root), t, sixteenth * 4, 0.18);
    }

    // drums
    if (st.drums === "lofi") {
      if (inBar === 0 || inBar === 7 || inBar === 10) this.kick(t, 0.55);
      if (inBar === 4 || inBar === 12) this.snare(t, 0.22);
      if (inBar % 2 === 0) this.hat(t, inBar % 4 === 0 ? 0.05 : 0.035);
    } else if (st.drums === "brush") {
      if (inBar === 0 || inBar === 8) this.kick(t, 0.25);
      if (inBar === 4 || inBar === 12) this.snare(t, 0.1, true);
      if (inBar % 4 === 0 || inBar % 4 === 3) this.hat(t, 0.03);
    } else if (st.drums === "bossa") {
      if ([0, 3, 8, 11].includes(inBar)) this.kick(t, 0.3);
      if ([0, 3, 6, 10, 12].includes(inBar)) this.rim(t, 0.12);
      this.hat(t, inBar % 2 ? 0.02 : 0.032);
    }

    // melody: a gentle random walk over the chord + pentatonic tones
    if (inBar % 2 === 0 && Math.random() < st.melody) {
      const pool = [...chord.map((n) => n + 12), ...chord.map((n) => n + 24)].filter((n) => n >= 64 && n <= 86);
      const near = pool.sort((a, b) => Math.abs(a - this.melodyNote) - Math.abs(b - this.melodyNote)).slice(0, 3);
      this.melodyNote = near[Math.floor(Math.random() * near.length)] ?? this.melodyNote;
      this.bell(hz(this.melodyNote), t, sixteenth * (2 + Math.floor(Math.random() * 4)), 0.05);
    }
  }

  // ───────────────────────── instruments
  private env(g: GainNode, t: number, a: number, peak: number, dur: number, rel = 0.25) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * 0.6, t + a, dur * 0.4);
    g.gain.setTargetAtTime(0.0001, t + dur, rel);
  }
  private osc(type: OscillatorType, f: number, t: number, end: number, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.start(t);
    o.stop(end);
    return o;
  }
  /** soft electric-piano: sine + quiet detuned triangle, filtered */
  private keys(f: number, t: number, dur: number, vol: number) {
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    this.env(g, t, 0.012, vol, dur, 0.35);
    const end = t + dur + 1.5;
    this.osc("sine", f, t, end).connect(g);
    const tri = this.osc("triangle", f, t, end, 6);
    const tg = this.ctx.createGain();
    tg.gain.value = 0.35;
    tri.connect(tg).connect(g);
    g.connect(lp).connect(this.master);
  }
  private pad(f: number, t: number, dur: number, vol: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1200;
    for (const d of [-7, 7]) this.osc("sawtooth", f, t, t + dur + 0.1, d).connect(g);
    g.connect(lp).connect(this.master);
  }
  private bass(f: number, t: number, dur: number, vol: number) {
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, vol, dur * 0.8, 0.12);
    this.osc("sine", f, t, t + dur + 0.6).connect(g);
    g.connect(this.master);
  }
  private bell(f: number, t: number, dur: number, vol: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8);
    this.osc("sine", f, t, t + dur + 1).connect(g);
    const h = this.ctx.createGain();
    h.gain.value = 0.12;
    this.osc("sine", f * 3, t, t + 0.4).connect(h).connect(g);
    g.connect(this.master);
  }
  private kick(t: number, vol: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.35);
  }
  private noiseHit(t: number, vol: number, dur: number, type: BiquadFilterType, freq: number, q = 0.8) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }
  private snare(t: number, vol: number, brush = false) {
    this.noiseHit(t, vol, brush ? 0.28 : 0.18, "bandpass", brush ? 3000 : 1800, brush ? 0.5 : 0.9);
  }
  private hat(t: number, vol: number) {
    this.noiseHit(t, vol, 0.05, "highpass", 7000);
  }
  private rim(t: number, vol: number) {
    this.noiseHit(t, vol, 0.04, "bandpass", 2600, 6);
  }

  // ───────────────────────── colour
  private startCrackle() {
    const len = 4;
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      // brown-ish hiss + sparse pops
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995;
      d[i] = last * 0.6 + (Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.9 : 0);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 400;
    src.connect(hp).connect(this.crackleGain);
    src.start();
    this.crackleSrc = src;
    this.crackleGain.gain.setTargetAtTime(0.018 * this.style.crackle, this.ctx.currentTime, 0.8);
  }
  private noiseBuffer(sec: number) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  private impulse(sec: number) {
    const rate = this.ctx.sampleRate;
    const b = this.ctx.createBuffer(2, rate * sec, rate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.6);
    }
    return b;
  }
}
