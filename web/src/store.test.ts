import { beforeEach, describe, expect, it } from "vitest";
import type { Me, ServerMsg, StateView } from "./protocol";
import { noticeText, Store } from "./store";

const me: Me = { player_id: "p", username: "jeremy", guest: false, elo: 1284, rank: 3, games: 4, wins: 2, draws: 1, losses: 1 };

const welcome: ServerMsg = { type: "welcome", player_id: "p", token: "t", deck: ["freeze"], pending_reward: null, account: me };

function stateMsg(over: Partial<StateView> = {}): ServerMsg {
  return {
    type: "state",
    game_id: "g",
    clock: { white_ms: 1, black_ms: 1, running: "white" },
    rated: true,
    opponent: { username: "ada", elo: 1300, guest: false },
    draw_offer: "none",
    ply_count: 0,
    you: "white",
    ply: 0,
    to_move: "white",
    in_check: false,
    board: Array(64).fill(null),
    moves: [],
    skill_options: [],
    my_skills: [],
    opponent_skills: { total: 0, used: [] },
    effects: [],
    outcome: { type: "ongoing" },
    events: [],
    opponent_connected: true,
    ...over,
  };
}

let store: Store;
beforeEach(() => {
  store = new Store();
});

describe("store messages", () => {
  it("keeps the account from welcome", () => {
    store.receive(welcome);
    expect(store.getState().account).toEqual(me);
    expect(store.getState().connection).toBe("open");
  });

  it("stores friends and search results", () => {
    store.receive({ type: "friends", friends: [{ username: "ada", elo: 1300, presence: "online", last_seen: null }], incoming: [{ username: "bob", elo: 1100 }], outgoing: [] });
    expect(store.getState().friends.incoming).toHaveLength(1);
    store.receive({ type: "user_results", query: "ad", users: [{ username: "ada", elo: 1300, relation: "friend" }] });
    expect(store.getState().userResults?.query).toBe("ad");
  });

  it("turns notices into French toasts", () => {
    store.receive({ type: "notice", code: "friend_request_received", username: "ada" });
    expect(store.getState().toasts[0].text).toBe("ada vous a envoyé une demande d'ami.");
    expect(noticeText("friend_busy", "bob")).toContain("bob");
    expect(noticeText("user_not_found")).toMatch(/introuvable/i);
  });

  it("tracks challenges", () => {
    store.receive({ type: "challenge_received", from: { username: "ada", elo: 1300 } });
    expect(store.getState().incomingChallenge).toEqual({ username: "ada", elo: 1300 });
    store.respondChallenge(false);
    expect(store.getState().incomingChallenge).toBeNull();
    store.receive({ type: "challenge_sent", username: "ada" });
    expect(store.getState().outgoingChallenge).toBe("ada");
    store.receive({ type: "notice", code: "challenge_declined", username: "ada" });
    expect(store.getState().outgoingChallenge).toBeNull();
  });

  it("resets chat and rematch when a new game starts", () => {
    store.receive({ type: "chat", text: "salut", mine: true });
    store.receive({ type: "rematch_offered" });
    expect(store.getState().chat).toEqual([{ mine: true, text: "salut" }]);
    expect(store.getState().rematch).toBe("received");
    store.receive({ type: "deck_select", game_id: "g2", opponent: { username: null, elo: null, guest: true }, rated: false, you: "black", deck: [], max_picks: 3, seconds: 30, submitted: false });
    expect(store.getState().chat).toEqual([]);
    expect(store.getState().rematch).toBe("none");
  });

  it("follows draw offers on the current game", () => {
    store.receive(stateMsg());
    store.receive({ type: "draw_offered" });
    expect(store.getState().game?.draw_offer).toBe("them");
    store.respondDraw(false);
    expect(store.getState().game?.draw_offer).toBe("none");
    store.offerDraw();
    expect(store.getState().game?.draw_offer).toBe("you");
    store.receive({ type: "draw_declined" });
    expect(store.getState().game?.draw_offer).toBe("none");
  });

  it("records the result and the new Elo", () => {
    store.receive(welcome);
    store.receive({ type: "game_over", outcome: { type: "timeout", winner: "white" }, reward: null, rated: true, elo: { you_before: 1284, you_after: 1298, opp_before: 1300, opp_after: 1290 }, reason: "timeout" });
    expect(store.getState().over?.reason).toBe("timeout");
    expect(store.getState().account?.elo).toBe(1298);
  });

  it("tracks the rematch handshake", () => {
    store.requestRematch();
    expect(store.getState().rematch).toBe("offered");
    store.receive({ type: "rematch_declined" });
    expect(store.getState().rematch).toBe("none");
  });
});
