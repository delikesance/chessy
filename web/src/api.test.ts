import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, apiErrorText } from "./api";

function mockFetch(res: { status: number; body?: unknown } | Error) {
  const fn = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), { status: res.status });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("envoie le corps JSON et renvoie la réponse", async () => {
    const fn = mockFetch({ status: 200, body: { token: "t", player: { username: "a" } } });
    const res = await api.login({ username: "a", password: "pppppppp" });
    expect(res.token).toBe("t");
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ username: "a", password: "pppppppp" });
  });

  it("place le jeton dans Authorization: Bearer", async () => {
    const fn = mockFetch({ status: 204 });
    await expect(api.logout("abc")).resolves.toBeUndefined();
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });

  it("normalise les erreurs serveur", async () => {
    mockFetch({ status: 409, body: { error: "username_taken" } });
    await expect(api.register({ username: "a", password: "b" })).rejects.toMatchObject({ code: "username_taken", status: 409 });
  });

  it("garde le code HTTP si le corps n'est pas JSON", async () => {
    mockFetch({ status: 502 });
    await expect(api.leaderboard()).rejects.toMatchObject({ code: "http_502", status: 502 });
  });

  it("signale une panne réseau", async () => {
    mockFetch(new TypeError("fail"));
    await expect(api.leaderboard()).rejects.toMatchObject({ code: "network", status: 0 });
  });

  it("encode le pseudo et pagine le classement", async () => {
    const fn = mockFetch({ status: 200, body: { total: 0, entries: [] } });
    await api.leaderboard(50, 100);
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe("/api/leaderboard?limit=50&offset=100");
    await api.profile("a b");
    expect((fn.mock.calls[1] as unknown as [string])[0]).toBe("/api/players/a%20b");
  });
});

describe("apiErrorText", () => {
  it("traduit en français", () => {
    expect(apiErrorText(new ApiError("bad_credentials", 401))).toBe("Pseudo ou mot de passe incorrect.");
    expect(apiErrorText(new ApiError("http_404", 404))).toBe("Introuvable.");
    expect(apiErrorText(new ApiError("http_500", 500))).toMatch(/serveur/);
    expect(apiErrorText(new Error("x"))).toMatch(/erreur/i);
  });
});
