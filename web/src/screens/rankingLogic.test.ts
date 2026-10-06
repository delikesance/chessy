import { describe, expect, it } from "vitest";
import type { LeaderboardEntry } from "../protocol";
import { displayRank, filterEntries, missingFriends } from "./rankingLogic";

const e = (rank: number, username: string, elo: number): LeaderboardEntry => ({ rank, username, elo, games: 10, wins: 5, draws: 1, losses: 4 });
const entries = [e(1, "Ann", 1800), e(2, "bob", 1500), e(3, "Cid", 1400), e(4, "dan", 1300)];

describe("filterEntries", () => {
  it("garde tout en mode général", () => {
    expect(filterEntries(entries, "all", [], null)).toHaveLength(4);
  });
  it("garde les amis et soi, sans tenir compte de la casse", () => {
    const out = filterEntries(entries, "friends", ["BOB"], "Dan");
    expect(out.map((x) => x.username)).toEqual(["bob", "dan"]);
  });
  it("renumérote dans la liste filtrée", () => {
    const out = filterEntries(entries, "friends", ["bob"], "dan");
    expect(out.map((x, i) => displayRank(x, i, "friends"))).toEqual([1, 2]);
    expect(displayRank(entries[3], 3, "all")).toBe(4);
  });
});

describe("missingFriends", () => {
  it("liste les amis pas encore chargés", () => {
    expect(missingFriends(entries, ["bob", "zoe"])).toEqual(["zoe"]);
  });
});
