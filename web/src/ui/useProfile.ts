import { useCallback, useEffect, useState } from "react";
import { api, ApiError, apiErrorText } from "../api";
import type { PublicProfile } from "../protocol";

export type ProfileState =
  | { status: "loading" }
  | { status: "ready"; profile: PublicProfile }
  | { status: "notfound" }
  | { status: "error"; message: string };

/** Charge `GET /api/players/{username}` et recharge quand le pseudo change. */
export function useProfile(username: string | null): { state: ProfileState; reload: () => void } {
  const [state, setState] = useState<ProfileState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!username) return;
    const ctl = new AbortController();
    setState({ status: "loading" });
    api
      .profile(username, ctl.signal)
      .then((profile) => setState({ status: "ready", profile }))
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        if (e instanceof ApiError && e.status === 404) setState({ status: "notfound" });
        else setState({ status: "error", message: apiErrorText(e) });
      });
    return () => ctl.abort();
  }, [username, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, reload };
}
