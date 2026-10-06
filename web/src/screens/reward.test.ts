import { describe, expect, it } from "vitest";
import type { RewardOffer } from "../protocol";
import { buildChoice } from "./RewardModal";

const offer = (deck_full: boolean): RewardOffer => ({ deck: ["freeze", "imune"], steal_options: ["clone"], deck_full });

describe("reward choice", () => {
  it("needs a pick, and a replaced slot only when the deck is full", () => {
    expect(buildChoice(offer(false), null, undefined)).toBeNull();
    expect(buildChoice(offer(false), { kind: "random" }, undefined)).toEqual({ kind: "random" });
    expect(buildChoice(offer(false), { kind: "steal", skill: "clone" }, "freeze")).toEqual({ kind: "steal", skill: "clone" });
    expect(buildChoice(offer(true), { kind: "random" }, undefined)).toBeNull();
    expect(buildChoice(offer(true), { kind: "steal", skill: "clone" }, "freeze")).toEqual({ kind: "steal", skill: "clone", replace: "freeze" });
  });
});
