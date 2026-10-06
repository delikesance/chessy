// Client REST typé pour /api (voir docs/spec-v2.md §1). Aucune dépendance au store :
// les appelants passent le jeton de session quand la route l'exige.
import type { Leaderboard, Me, PublicProfile } from "./protocol";

export interface AuthResponse {
  token: string;
  player: Me;
}

export interface Credentials {
  username: string;
  password: string;
}

/** Erreur normalisée : `code` est le champ `error` du serveur (ou `network` / `http_<statut>`). */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const ERROR_TEXT: Record<string, string> = {
  username_taken: "Ce pseudo est déjà pris.",
  bad_credentials: "Pseudo ou mot de passe incorrect.",
  weak_password: "Mot de passe trop faible : 8 à 128 caractères.",
  invalid_username: "Pseudo invalide : 3 à 16 caractères, lettres, chiffres ou _.",
  unauthorized: "Votre session a expiré. Reconnectez-vous.",
  not_found: "Introuvable.",
  network: "Impossible de joindre le serveur. Vérifiez votre connexion.",
  rate_limited: "Trop de tentatives. Réessayez dans un instant.",
  too_many_attempts: "Trop d'échecs de connexion. Réessayez dans quelques minutes.",
};

/** Message français pour une erreur API (ou quelconque). */
export function apiErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (ERROR_TEXT[err.code]) return ERROR_TEXT[err.code];
    if (err.status === 401) return ERROR_TEXT.unauthorized;
    if (err.status === 404) return ERROR_TEXT.not_found;
    if (err.status >= 500) return "Le serveur a rencontré un problème. Réessayez plus tard.";
  }
  return "Une erreur est survenue. Réessayez.";
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("network", 0);
  }

  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data?.error === "string") code = data.error;
    } catch {
      // Corps absent ou non JSON : on garde le code HTTP.
    }
    throw new ApiError(code, res.status);
  }
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("bad_response", res.status);
  }
}

export const api = {
  register(input: Credentials & { guest_token?: string }, signal?: AbortSignal) {
    return request<AuthResponse>("/auth/register", { method: "POST", body: input, signal });
  },
  login(input: Credentials, signal?: AbortSignal) {
    return request<AuthResponse>("/auth/login", { method: "POST", body: input, signal });
  },
  logout(token: string) {
    return request<void>("/auth/logout", { method: "POST", token });
  },
  me(token: string, signal?: AbortSignal) {
    return request<Me>("/me", { token, signal });
  },
  leaderboard(limit = 50, offset = 0, signal?: AbortSignal) {
    return request<Leaderboard>(`/leaderboard?limit=${limit}&offset=${offset}`, { signal });
  },
  profile(username: string, signal?: AbortSignal) {
    return request<PublicProfile>(`/players/${encodeURIComponent(username)}`, { signal });
  },
};
