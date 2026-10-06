import { useSyncExternalStore } from "react";
import type {
  ClientMsg,
  DeckSelectInfo,
  LobbyStatus,
  Outcome,
  RewardOffer,
  ServerMsg,
  SkillId,
  StateView,
} from "./protocol";

export interface Toast {
  id: number;
  text: string;
}

export interface AppState {
  connection: "connecting" | "open" | "closed" | "replaced";
  playerId: string | null;
  deck: SkillId[];
  lobby: LobbyStatus;
  deckSelect: DeckSelectInfo | null;
  game: StateView | null;
  /** Set once the server reports the game as finished. */
  over: { outcome: Outcome; reward: RewardOffer | null } | null;
  /** A reward from a past game that was never claimed. */
  pendingReward: RewardOffer | null;
  toast: Toast | null;
}

const TOKEN_KEY = "chessy.token";

function readToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private mode: the player simply gets a fresh identity next visit.
  }
}

const initial: AppState = {
  connection: "connecting",
  playerId: null,
  deck: [],
  lobby: { type: "idle" },
  deckSelect: null,
  game: null,
  over: null,
  pendingReward: null,
  toast: null,
};

const ERROR_TEXT: Record<string, string> = {
  not_your_turn: "Ce n'est pas votre tour.",
  illegal_action: "Action impossible.",
  no_such_room: "Cette salle n'existe pas.",
  own_room: "Vous ne pouvez pas rejoindre votre propre salle.",
  already_in_game: "Vous êtes déjà dans une partie.",
  invalid_deck: "Sélection de compétences invalide.",
  replaced: "Ce compte s'est connecté depuis un autre onglet.",
};

export class Store {
  private state: AppState = initial;
  private listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private retry = 0;
  private toastId = 0;
  private stopped = false;

  getState = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private notify(text: string) {
    this.set({ toast: { id: ++this.toastId, text } });
  }

  dismissToast() {
    this.set({ toast: null });
  }

  connect() {
    this.stopped = false;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${location.host}/ws`);
    this.socket = socket;
    // Only the current socket may act: React StrictMode (and reconnects) can
    // leave a stale one around whose late events must be ignored.
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.retry = 0;
      socket.send(JSON.stringify({ type: "hello", token: readToken() } satisfies ClientMsg));
    };
    socket.onmessage = (e) => {
      if (this.socket === socket) this.receive(JSON.parse(e.data as string) as ServerMsg);
    };
    socket.onclose = () => {
      if (this.socket !== socket || this.stopped || this.state.connection === "replaced") return;
      this.set({ connection: "closed" });
      const delay = Math.min(1000 * 2 ** this.retry++, 10000);
      setTimeout(() => !this.stopped && this.connect(), delay);
    };
  }

  disconnect() {
    this.stopped = true;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  send(msg: ClientMsg) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  /** Leaves a finished game and returns to the lobby. */
  leaveGame() {
    this.set({ game: null, over: null, deckSelect: null });
  }

  receive(msg: ServerMsg) {
    switch (msg.type) {
      case "welcome":
        writeToken(msg.token);
        this.set({
          connection: "open",
          playerId: msg.player_id,
          deck: msg.deck,
          pendingReward: msg.pending_reward,
        });
        break;
      case "lobby":
        this.set({ lobby: msg.status });
        break;
      case "deck_select": {
        const { type: _type, ...info } = msg;
        this.set({ deckSelect: info, game: null, over: null, pendingReward: null });
        break;
      }
      case "state": {
        const { type: _type, ...view } = msg;
        this.set({ game: view, deckSelect: null });
        break;
      }
      case "opponent_status":
        if (this.state.game) {
          this.set({ game: { ...this.state.game, opponent_connected: msg.connected } });
        }
        break;
      case "game_over":
        this.set({ over: { outcome: msg.outcome, reward: msg.reward } });
        break;
      case "deck_update":
        this.set({
          deck: msg.deck,
          pendingReward: null,
          over: this.state.over ? { ...this.state.over, reward: null } : null,
        });
        break;
      case "game_cancelled":
        this.set({ game: null, deckSelect: null, over: null });
        this.notify("La partie a été annulée.");
        break;
      case "error":
        if (msg.code === "replaced") this.set({ connection: "replaced" });
        this.notify(ERROR_TEXT[msg.code] ?? msg.message);
        break;
    }
  }
}

export const store = new Store();

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
