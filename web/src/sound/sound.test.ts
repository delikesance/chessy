import { describe, expect, it, vi } from "vitest";
import type { GameEvent, Piece } from "../protocol";
import { ALL_SFX, allowed, createSfx, MAX_VOICES, SKILL_IDS, SOUND_DEFAULTS, SOUND_KEY, sanitizeSettings } from "./index";
import { mapEventsToSfx, planSfx } from "./mapping";
import { RECIPES } from "./recipes";

const piece = (id = 1): Piece => ({ id, kind: "pawn", color: "black" });
const me = { me: "white" as const };

describe("mapEventsToSfx", () => {
  it("coup simple -> move", () => {
    expect(mapEventsToSfx([{ type: "moved", from: 12, to: 28, piece: 1 }], me)).toEqual(["move"]);
  });
  it("capture prioritaire sur move", () => {
    const ev: GameEvent[] = [
      { type: "captured", square: 28, piece: piece() },
      { type: "moved", from: 21, to: 28, piece: 2 },
    ];
    expect(mapEventsToSfx(ev, me)).toEqual(["capture"]);
  });
  it("roque remplace move", () => {
    const ev: GameEvent[] = [
      { type: "moved", from: 4, to: 6, piece: 1 },
      { type: "castled", rook_from: 7, rook_to: 5 },
    ];
    expect(mapEventsToSfx(ev, me)).toEqual(["castle"]);
  });
  it("promotion sans capture -> promote ; avec capture -> capture puis promote", () => {
    const promo: GameEvent = { type: "promoted", square: 60, to: "queen" };
    const mv: GameEvent = { type: "moved", from: 52, to: 60, piece: 1 };
    expect(mapEventsToSfx([mv, promo], me)).toEqual(["promote"]);
    expect(mapEventsToSfx([{ type: "captured", square: 60, piece: piece() }, mv, promo], me)).toEqual(["capture", "promote"]);
  });
  it("une compétence joue son propre son, pas move", () => {
    const ev: GameEvent[] = [
      { type: "skill_used", color: "white", skill: "teleportation", target: { kind: "piece_to", from: 1, to: 2 } },
      { type: "teleported", from: 1, to: 2 },
    ];
    expect(mapEventsToSfx(ev, me)).toEqual(["skill_teleportation"]);
  });
  it("conséquences d'une action : piège, repoussé, sauvé, disparition", () => {
    expect(mapEventsToSfx([{ type: "moved", from: 1, to: 2, piece: 1 }, { type: "trap_sprung", square: 2, piece: 1 }], me)).toEqual(["move", "trap_sprung"]);
    expect(mapEventsToSfx([{ type: "captured", square: 2, piece: piece() }, { type: "pushed", piece: 1, from: 2, to: 4 }], me)).toEqual(["capture", "pushed"]);
    expect(mapEventsToSfx([{ type: "saved", piece: 1, from: 2, to: 4 }], me)).toEqual(["saved"]);
    expect(mapEventsToSfx([{ type: "vanished", square: 2, piece: piece() }], me)).toEqual(["vanish"]);
  });
  it("l'échec est ajouté à la fin, sans doublon", () => {
    const ev: GameEvent[] = [{ type: "captured", square: 2, piece: piece() }, { type: "moved", from: 1, to: 2, piece: 1 }];
    expect(mapEventsToSfx(ev, { me: "white", check: true })).toEqual(["capture", "check"]);
    expect(mapEventsToSfx([], { me: "white", check: true })).toEqual(["check"]);
  });
  it("aucun événement -> aucun son", () => {
    expect(mapEventsToSfx([], me)).toEqual([]);
  });
  it("les 27 compétences ont un son et une recette", () => {
    for (const id of SKILL_IDS) {
      const ev: GameEvent[] = [{ type: "skill_used", color: "white", skill: id, target: { kind: "none" } }];
      expect(mapEventsToSfx(ev, me)).toEqual([`skill_${id}`]);
      expect(RECIPES[`skill_${id}`]).toBeTypeOf("function");
    }
    expect(SKILL_IDS).toHaveLength(27);
    expect(ALL_SFX.every((n) => typeof RECIPES[n] === "function")).toBe(true);
  });
  it("planification : décalages croissants, adversaire un peu plus discret", () => {
    const plan = planSfx(["capture", "check"], { me: "white", actor: "black" });
    expect(plan[0].delay).toBeGreaterThan(0);
    expect(plan[1].delay).toBeGreaterThan(plan[0].delay);
    expect(plan[0].volume).toBeLessThan(1);
    expect(planSfx(["move"], { me: "white", actor: "white" })[0].volume).toBe(1);
  });
});

describe("réglages", () => {
  it("valeurs par défaut et assainissement", () => {
    expect(sanitizeSettings(null)).toEqual(SOUND_DEFAULTS);
    expect(sanitizeSettings({ master: 4, effects: -1, enabled: "x" })).toEqual({ ...SOUND_DEFAULTS, master: 1, effects: 0 });
  });
  it("persistance dans chessy.sound et abonnements", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const a = createSfx({ AudioCtor: null, storage, target: null });
    const fn = vi.fn();
    const off = a.subscribe(fn);
    a.setSettings({ master: 0.3, ui: false });
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    a.setSettings({ enabled: false });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(SOUND_KEY)!)).toMatchObject({ master: 0.3, ui: false, enabled: false });
    const b = createSfx({ AudioCtor: null, storage, target: null });
    expect(b.getSettings()).toMatchObject({ master: 0.3, ui: false, enabled: false });
  });
  it("stockage défaillant : pas d'exception", () => {
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const s = createSfx({ AudioCtor: null, storage, target: null });
    expect(() => s.setSettings({ master: 0.2 })).not.toThrow();
    expect(s.getSettings().master).toBe(0.2);
  });
  it("allowed : interrupteurs", () => {
    const s = { ...SOUND_DEFAULTS };
    expect(allowed("move", s)).toBe(true);
    expect(allowed("move", { ...s, enabled: false })).toBe(false);
    expect(allowed("your_turn", { ...s, yourTurn: false })).toBe(false);
    expect(allowed("your_turn", { ...s, yourTurn: false }, true)).toBe(true);
    expect(allowed("ui_click", { ...s, ui: false })).toBe(false);
    expect(allowed("chat", { ...s, ui: false })).toBe(false);
    expect(allowed("capture", { ...s, ui: false })).toBe(true);
    expect(allowed("move", { ...s, master: 0 })).toBe(false);
  });
});

// ---- faux AudioContext ----------------------------------------------------------------------

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}
class FakeNode {
  connected = new Set<FakeNode>();
  disconnected = false;
  connect = vi.fn((n: FakeNode) => {
    this.connected.add(n);
    return n;
  });
  disconnect = vi.fn(() => {
    this.disconnected = true;
  });
}
class FakeSource extends FakeNode {
  type = "sine";
  frequency = new FakeParam();
  detune = new FakeParam();
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}
class FakeCtx {
  static instances: FakeCtx[] = [];
  currentTime = 0;
  sampleRate = 8000;
  state: "running" | "suspended" = "suspended";
  destination = new FakeNode();
  nodes: FakeNode[] = [];
  sources: FakeSource[] = [];
  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  constructor() {
    FakeCtx.instances.push(this);
  }
  private n<T extends FakeNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }
  createGain() {
    return this.n(Object.assign(new FakeNode(), { gain: new FakeParam() }));
  }
  createDynamicsCompressor() {
    return this.n(Object.assign(new FakeNode(), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() }));
  }
  createConvolver() {
    return this.n(Object.assign(new FakeNode(), { buffer: null as unknown }));
  }
  createBiquadFilter() {
    return this.n(Object.assign(new FakeNode(), { type: "lowpass", frequency: new FakeParam(), Q: new FakeParam(), gain: new FakeParam() }));
  }
  createStereoPanner() {
    return this.n(Object.assign(new FakeNode(), { pan: new FakeParam() }));
  }
  createOscillator() {
    const s = this.n(new FakeSource());
    this.sources.push(s);
    return s;
  }
  createBufferSource() {
    const s = this.n(new FakeSource());
    this.sources.push(s);
    return s;
  }
  createBuffer(channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length), numberOfChannels: channels, length };
  }
}

function setup(extra: Partial<Parameters<typeof createSfx>[0]> = {}) {
  FakeCtx.instances = [];
  const target = new EventTarget();
  const s = createSfx({ AudioCtor: FakeCtx as unknown as new () => AudioContext, storage: null, random: () => 0.5, target, ...extra });
  return { s, target, ctx: () => FakeCtx.instances[0] };
}

describe("moteur Web Audio", () => {
  it("sans AudioContext : tout est no-op, aucune exception", () => {
    const s = createSfx({ AudioCtor: null, storage: null, target: null });
    expect(() => {
      s.unlock();
      s.play("move");
      s.playEvents([{ type: "moved", from: 1, to: 2, piece: 1 }], { me: "white" });
    }).not.toThrow();
    expect(s.isReady()).toBe(false);
  });

  it("aucun contexte ni son avant le premier geste", () => {
    const { s, ctx } = setup();
    s.play("move");
    expect(ctx()).toBeUndefined();
    expect(s.isReady()).toBe(false);
  });

  it("le premier geste crée et reprend le contexte, une seule fois", () => {
    const { s, target, ctx } = setup();
    target.dispatchEvent(new Event("pointerdown"));
    expect(FakeCtx.instances).toHaveLength(1);
    expect(ctx().resume).toHaveBeenCalled();
    expect(s.isReady()).toBe(true);
    target.dispatchEvent(new Event("keydown"));
    expect(FakeCtx.instances).toHaveLength(1);
  });

  it("une lecture crée des nœuds, planifie des sources, puis les libère", () => {
    const { s, ctx } = setup();
    s.unlock();
    const c = ctx();
    const before = c.nodes.length;
    s.play("capture");
    expect(c.nodes.length).toBeGreaterThan(before + 5);
    expect(c.sources.length).toBeGreaterThan(2);
    for (const src of c.sources) {
      expect(src.start).toHaveBeenCalled();
      expect(src.stop).toHaveBeenCalled();
      expect(src.disconnected).toBe(false);
    }
    c.sources.forEach((src) => src.onended?.());
    // Les nœuds de la voix sont déconnectés ; le bus principal (limiteur, sortie) reste.
    expect(c.sources.every((src) => src.disconnected)).toBe(true);
    expect(c.nodes.filter((n) => n.disconnected).length).toBeGreaterThan(c.sources.length);
  });

  it("aléa de hauteur borné à ±3 %", () => {
    const { s, ctx } = setup({ random: () => 1 });
    s.unlock();
    s.play("low_time");
    const first = ctx().sources[0];
    const freq = first.frequency.setValueAtTime.mock.calls[0][0] as number;
    expect(freq).toBeCloseTo(1760 * 1.03, 3);
  });

  it("les réglages coupent le son avant toute création de nœud", () => {
    const { s, ctx } = setup();
    s.unlock();
    const n = ctx().nodes.length;
    s.setSettings({ enabled: false });
    s.play("move");
    s.playEvents([{ type: "moved", from: 1, to: 2, piece: 1 }], { me: "white" });
    expect(ctx().nodes.length).toBe(n);
    s.setSettings({ enabled: true, ui: false });
    s.play("ui_click");
    expect(ctx().nodes.length).toBe(n);
    s.play("ui_click", { force: true, delay: 0 });
    expect(ctx().nodes.length).toBeGreaterThan(n);
  });

  it("playEvents joue les sons mappés avec des retards croissants", () => {
    const { s, ctx } = setup();
    s.unlock();
    s.playEvents([{ type: "moved", from: 1, to: 2, piece: 1 }], { me: "white", actor: "white", check: true });
    const starts = ctx().sources.map((x) => x.start.mock.calls[0][0] as number);
    expect(Math.max(...starts)).toBeGreaterThan(Math.min(...starts) + 0.1);
  });

  it("polyphonie limitée : les sons accessoires sont abandonnés, les autres volent la plus ancienne voix", () => {
    const { s, ctx } = setup();
    s.unlock();
    const c = ctx();
    // Temps différents pour éviter l'anti-doublon.
    const names = ["move", "capture", "castle", "check", "promote", "illegal", "your_turn", "game_start", "game_win", "game_lose", "game_draw", "match_found"] as const;
    names.forEach((n, i) => s.play(n, { delay: i * 0.5 }));
    const sources = c.sources.length;
    s.play("ui_click", { delay: 9 });
    expect(c.sources.length).toBe(sources);
    s.play("shield", { delay: 10 });
    expect(c.sources.length).toBeGreaterThan(sources);
    expect(names.length).toBe(MAX_VOICES);
  });

  it("doublon immédiat ignoré", () => {
    const { s, ctx } = setup();
    s.unlock();
    s.play("move");
    const n = ctx().sources.length;
    s.play("move");
    expect(ctx().sources.length).toBe(n);
  });

  it("une exception du contexte n'est jamais propagée", () => {
    const { s, ctx } = setup();
    s.unlock();
    ctx().createOscillator = () => {
      throw new Error("boom");
    };
    expect(() => s.play("move", { delay: 3 })).not.toThrow();
  });

  it("chaque recette se construit sur un faux contexte sans erreur", () => {
    const { s, ctx } = setup({ random: () => 0.2 });
    s.unlock();
    ALL_SFX.forEach((name, i) => {
      const before = ctx().sources.length;
      s.play(name, { force: true, delay: i * 2 });
      expect(ctx().sources.length, name).toBeGreaterThan(before);
      ctx().sources.forEach((x) => x.onended?.());
    });
  });
});
