// Moteur sonore de Chessy (docs/spec-v4.md §4) : tout est synthétisé avec Web Audio, aucun fichier audio.
// L'AudioContext n'est créé qu'au premier geste utilisateur ; sans AudioContext (tests, SSR) tout est no-op.
import type { Color, GameEvent } from "../protocol";
import { isLowPriority, isUiSfx, type SfxName } from "./names";
import { mapEventsToSfx, planSfx } from "./mapping";
import { RECIPES } from "./recipes";
import { createEngine, Voice, type Engine } from "./synth";

export type { SfxName } from "./names";
export { mapEventsToSfx, planSfx } from "./mapping";
export { ALL_SFX, BASIC_SFX, SKILL_IDS, skillSfx } from "./names";

export interface SoundSettings {
  enabled: boolean;
  master: number;
  effects: number;
  ui: boolean;
  yourTurn: boolean;
}

export interface PlayOpts {
  volume?: number;
  /** Secondes de retard (planification exacte sur l'horloge audio). */
  delay?: number;
  /** Aperçu (page Réglages) : ignore les interrupteurs `ui` et `yourTurn`. */
  force?: boolean;
}

export interface Sfx {
  play(name: SfxName, opts?: PlayOpts): void;
  /** Joue les sons d'une action à partir de ses événements. `me` = camp du client, `actor` = camp qui a agi. */
  playEvents(events: GameEvent[], ctx: { me: Color; actor?: Color; check?: boolean }): void;
  getSettings(): SoundSettings;
  setSettings(patch: Partial<SoundSettings>): void;
  subscribe(fn: () => void): () => void;
  /** Crée/reprend l'AudioContext (appelé au premier geste utilisateur). */
  unlock(): void;
  /** Vrai quand le moteur audio est prêt à jouer. */
  isReady(): boolean;
}

export const SOUND_KEY = "chessy.sound";
export const SOUND_DEFAULTS: SoundSettings = { enabled: true, master: 0.7, effects: 1, ui: true, yourTurn: true };

const clamp01 = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback);

export function sanitizeSettings(raw: unknown): SoundSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    enabled: typeof o.enabled === "boolean" ? o.enabled : SOUND_DEFAULTS.enabled,
    master: clamp01(o.master, SOUND_DEFAULTS.master),
    effects: clamp01(o.effects, SOUND_DEFAULTS.effects),
    ui: typeof o.ui === "boolean" ? o.ui : SOUND_DEFAULTS.ui,
    yourTurn: typeof o.yourTurn === "boolean" ? o.yourTurn : SOUND_DEFAULTS.yourTurn,
  };
}

/** Un son est-il autorisé par les réglages ? (pur, testé) */
export function allowed(name: SfxName, s: SoundSettings, force = false): boolean {
  if (!s.enabled || s.master <= 0) return false;
  if (!force && name === "your_turn" && !s.yourTurn) return false;
  if (!force && isUiSfx(name) && !s.ui) return false;
  return true;
}

export const MAX_VOICES = 12;
const PITCH_SPREAD = 0.03;
const MIN_GAP = 0.035;

export interface SfxDeps {
  AudioCtor?: (new () => AudioContext) | null;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  random?: () => number;
  target?: Pick<EventTarget, "addEventListener" | "removeEventListener"> | null;
}

type AudioGlobal = typeof globalThis & { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext };

function defaultDeps(): Required<SfxDeps> {
  const g = globalThis as AudioGlobal;
  let storage: SfxDeps["storage"] = null;
  try {
    storage = typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    storage = null;
  }
  return {
    AudioCtor: g.AudioContext ?? g.webkitAudioContext ?? null,
    storage,
    random: Math.random,
    target: typeof window !== "undefined" ? window : null,
  };
}

export function createSfx(deps: SfxDeps = {}): Sfx {
  const d = { ...defaultDeps(), ...deps };
  let settings = load();
  const listeners = new Set<() => void>();
  let engine: Engine | null = null;
  let broken = false;
  const voices: Voice[] = [];
  const lastPlayed = new Map<SfxName, number>();
  let listening = false;

  function load(): SoundSettings {
    try {
      const raw = d.storage?.getItem(SOUND_KEY);
      return raw ? sanitizeSettings(JSON.parse(raw)) : { ...SOUND_DEFAULTS };
    } catch {
      return { ...SOUND_DEFAULTS };
    }
  }

  function save() {
    try {
      d.storage?.setItem(SOUND_KEY, JSON.stringify(settings));
    } catch {
      // Mode privé : les réglages ne survivent pas à la session.
    }
  }

  function unlock() {
    if (broken) return;
    if (!engine) {
      if (!d.AudioCtor) return;
      try {
        engine = createEngine(new d.AudioCtor(), settings.master);
      } catch {
        broken = true;
        engine = null;
        return;
      }
    }
    try {
      if (engine.ctx.state === "suspended") void engine.ctx.resume?.()?.catch?.(() => {});
    } catch {
      // reprise refusée : on réessaiera au prochain geste
    }
  }

  const onGesture = () => {
    unlock();
    if (engine && d.target && listening) {
      d.target.removeEventListener("pointerdown", onGesture, true);
      d.target.removeEventListener("keydown", onGesture, true);
      listening = false;
    }
  };

  if (d.AudioCtor && d.target) {
    d.target.addEventListener("pointerdown", onGesture, true);
    d.target.addEventListener("keydown", onGesture, true);
    listening = true;
  }

  function release(v: Voice) {
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
  }

  function play(name: SfxName, opts: PlayOpts = {}) {
    if (!engine || broken || !allowed(name, settings, opts.force)) return;
    const recipe = RECIPES[name];
    if (!recipe) return;
    const ctx = engine.ctx;
    try {
      if (ctx.state === "suspended") void ctx.resume?.()?.catch?.(() => {});
      const now = ctx.currentTime;
      const t0 = now + 0.006 + Math.max(0, opts.delay ?? 0);
      // Même son deux fois à moins de 35 ms : doublon, ignoré.
      const last = lastPlayed.get(name);
      if (last !== undefined && Math.abs(t0 - last) < MIN_GAP) return;
      lastPlayed.set(name, t0);
      // Polyphonie : au-delà de 12 voix, la plus ancienne est coupée en douceur ; les sons accessoires cèdent la place.
      const live = voices.filter((v) => !v.isDisposed);
      if (live.length >= MAX_VOICES) {
        if (isLowPriority(name)) return;
        live[0].fadeOut(0.02);
      }
      const pitch = 1 + (d.random() * 2 - 1) * PITCH_SPREAD;
      const volume = settings.effects * (opts.volume ?? 1);
      const voice = new Voice(engine, t0, pitch, Math.max(0, volume), release);
      voices.push(voice);
      recipe(voice);
    } catch {
      // Un son raté ne doit jamais casser le jeu.
    }
  }

  return {
    play,
    playEvents(events, ctx) {
      if (!engine || !settings.enabled) return;
      for (const p of planSfx(mapEventsToSfx(events, ctx), ctx)) play(p.name, { delay: p.delay, volume: p.volume });
    },
    getSettings: () => settings,
    setSettings(patch) {
      settings = sanitizeSettings({ ...settings, ...patch });
      save();
      if (engine) {
        try {
          engine.master.gain.setTargetAtTime(settings.master, engine.ctx.currentTime, 0.02);
        } catch {
          // contexte fermé
        }
      }
      listeners.forEach((fn) => fn());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    unlock,
    isReady: () => engine !== null && !broken,
  };
}

export const sfx: Sfx = createSfx();
