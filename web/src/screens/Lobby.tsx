import { useEffect, useState, type CSSProperties } from "react";
import { FAMILY_LABEL } from "../catalog";
import { hrefFor } from "../router";
import { skillInfo } from "../skills";
import { store, type AppState } from "../store";
import { SkillArt } from "../ui/SkillArt";
import { UniqueBadge } from "../ui/UniqueBadge";
import { SoloCard } from "./SoloCard";
import "./lobby.css";

const DECK_SLOTS = 7;

/** Secondes écoulées depuis que `active` est devenu vrai. */
function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    setSeconds(0);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}

export function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function Lobby({ state }: { state: AppState }) {
  const { lobby, deck, account } = state;
  const isAccount = !!account && !account.guest;
  const [ranked, setRanked] = useState(true);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const waiting = lobby.type !== "idle";
  const elapsed = useElapsed(waiting);
  const playRanked = isAccount && ranked;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Presse-papiers indisponible : le code reste lisible à l'écran.
    }
  };

  return (
    <main className="lb-page">
      <header className="lb-head">
        <p className="eyebrow">Lobby</p>
        <h1 className="lb-title">Les échecs, avec des compétences.</h1>
        <p className="muted lb-sub">
          Choisissez trois compétences de votre deck avant chaque partie et retournez la partie en un coup.
        </p>
      </header>

      <div className="lb-grid">
        <div className="lb-left">
        <section className="card lb-play" aria-label="Jouer">
          {lobby.type === "idle" && (
            <>
              {isAccount && (
                <div className="seg" role="group" aria-label="Type de partie">
                  <button type="button" aria-pressed={ranked} className={ranked ? "on" : ""} onClick={() => setRanked(true)}>
                    Classée
                  </button>
                  <button type="button" aria-pressed={!ranked} className={!ranked ? "on" : ""} onClick={() => setRanked(false)}>
                    Amicale
                  </button>
                </div>
              )}
              <button
                type="button"
                className="btn pri lb-main"
                onClick={() => store.send({ type: "queue_join", ranked: playRanked })}
              >
                {isAccount ? "Trouver une partie" : "Partie amicale"}
              </button>
              <p className="muted lb-note">
                {playRanked
                  ? "Adversaire de force proche ; l'Elo et une compétence à gagner sont en jeu."
                  : "Sans enjeu : ni Elo ni compétence à gagner."}
              </p>
              {account?.guest && (
                <div className="lb-nudge">
                  <p>
                    <strong>Créez un compte</strong> pour jouer en classée, grimper au classement et défier vos amis.
                  </p>
                  <a className="btn sm" href={hrefFor({ name: "auth" })}>
                    Créer un compte
                  </a>
                </div>
              )}

              <div className="lb-sep" role="separator">
                <span>ou</span>
              </div>

              <button type="button" className="btn lb-main" onClick={() => store.send({ type: "create_room" })}>
                Salle privée
              </button>
              <form
                className="lb-join"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.trim()) store.send({ type: "join_room", code: code.trim() });
                }}
              >
                <label className="sr-only" htmlFor="room-code">
                  Code de salle
                </label>
                <input
                  id="room-code"
                  className="input mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Code de salle"
                  maxLength={8}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="submit" className="btn" disabled={!code.trim()}>
                  Rejoindre
                </button>
              </form>
            </>
          )}

          {lobby.type === "queued" && (
            <div className="lb-wait" role="status">
              <p className="eyebrow">{lobby.ranked ? "File classée" : "File amicale"}</p>
              <p className="lb-wait-title">Recherche d'un adversaire…</p>
              <div className="lb-bar" aria-hidden="true">
                <i />
              </div>
              <p className="lb-timer mono" aria-label={`Temps d'attente : ${elapsed} secondes`}>
                {formatElapsed(elapsed)}
              </p>
              {lobby.ranked && (
                <p className="muted lb-note">La plage d'Elo s'élargit peu à peu pendant l'attente.</p>
              )}
              <button type="button" className="btn" onClick={() => store.send({ type: "leave_lobby" })}>
                Annuler la recherche
              </button>
            </div>
          )}

          {lobby.type === "room_waiting" && (
            <div className="lb-wait" role="status">
              <p className="eyebrow">Salle privée</p>
              <p className="lb-wait-title">Partagez ce code avec votre adversaire</p>
              <p className="lb-code mono" data-testid="room-code" aria-label={`Code de salle ${lobby.code.split("").join(" ")}`}>
                {lobby.code}
              </p>
              <button type="button" className="btn sm" onClick={() => copy(lobby.code)}>
                {copied ? "Code copié" : "Copier le code"}
              </button>
              <div className="lb-bar" aria-hidden="true">
                <i />
              </div>
              <p className="lb-timer mono">{formatElapsed(elapsed)}</p>
              <button type="button" className="btn" onClick={() => store.send({ type: "leave_lobby" })}>
                Fermer la salle
              </button>
            </div>
          )}
        </section>

        {lobby.type === "idle" && <SoloCard state={state} />}
        </div>

        <section className="card lb-deck" aria-labelledby="deck-title">
          <div className="lb-deck-head">
            <h2 id="deck-title" className="lb-h2">
              Votre deck
            </h2>
            <span className="mono muted">
              {deck.length}/{DECK_SLOTS}
            </span>
          </div>
          <ul className="lb-slots">
            {Array.from({ length: DECK_SLOTS }, (_, i) => {
              const id = deck[i];
              if (!id) {
                return (
                  <li key={`empty-${i}`} className="slot empty">
                    Emplacement libre
                  </li>
                );
              }
              const info = skillInfo(id);
              return (
                <li key={id} className={`slot${info.unique ? " foil" : ""}`} style={{ "--fam": `var(--fam-${info.family})` } as CSSProperties} title={info.description}>
                  <span className="slot-art">
                    <SkillArt id={id} size={54} />
                    {info.unique && <UniqueBadge />}
                  </span>
                  <span className="slot-name">{info.name}</span>
                  <span className="eyebrow">{info.unique ? "Unique" : FAMILY_LABEL[info.family]}</span>
                </li>
              );
            })}
          </ul>
          <p className="muted lb-note">
            Gagnez une partie pour prendre une compétence à votre adversaire ou en tirer une au hasard.
          </p>
        </section>
      </div>
    </main>
  );
}
