import { useEffect, useRef } from "react";
import { store } from "../store";
import { initialOf } from "./NavBar";

/** Défi reçu d'un ami : accepter ou refuser (il expire côté serveur après 60 s). */
export function ChallengeModal({ challenge }: { challenge: { username: string; elo: number } }) {
  const accept = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    accept.current?.focus();
  }, []);

  return (
    <div className="md-backdrop">
      <div
        className="md card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="challenge-title"
        onKeyDown={(e) => e.key === "Escape" && store.respondChallenge(false)}
      >
        <p className="eyebrow">Défi reçu</p>
        <div className="md-who">
          <span className="avatar">{initialOf(challenge.username)}</span>
          <div>
            <h2 id="challenge-title" className="md-title">
              {challenge.username} vous défie
            </h2>
            <p className="muted">
              <span className="mono">{challenge.elo}</span> Elo · partie amicale
            </p>
          </div>
        </div>
        <div className="md-actions">
          <button type="button" className="btn ghost" onClick={() => store.respondChallenge(false)}>
            Refuser
          </button>
          <button type="button" className="btn pri" ref={accept} onClick={() => store.respondChallenge(true)}>
            Accepter le défi
          </button>
        </div>
      </div>
    </div>
  );
}

/** Rappel d'un défi envoyé, en attente de réponse. */
export function OutgoingChallenge({ username }: { username: string }) {
  return (
    <div className="out-challenge card" role="status">
      <span>
        Défi envoyé à <strong>{username}</strong>…
      </span>
      <button type="button" className="btn sm ghost" onClick={() => store.cancelChallenge()}>
        Annuler
      </button>
    </div>
  );
}
