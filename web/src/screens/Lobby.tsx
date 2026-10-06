import { useState } from "react";
import type { AppState } from "../store";
import { store } from "../store";
import { SkillCard } from "./SkillCard";

export function Lobby({ state }: { state: AppState }) {
  const [code, setCode] = useState("");
  const { lobby, deck } = state;
  const busy = lobby.type !== "idle";

  return (
    <main className="screen lobby">
      <h1>Chessy</h1>
      <p className="lead">Les échecs, avec des compétences.</p>

      <section className="panel">
        {lobby.type === "queued" && <p className="status">Recherche d'un adversaire…</p>}
        {lobby.type === "room_waiting" && (
          <div className="status">
            <p>Partagez ce code avec votre adversaire :</p>
            <p className="room-code" data-testid="room-code">
              {lobby.code}
            </p>
          </div>
        )}
        {busy ? (
          <button type="button" onClick={() => store.send({ type: "leave_lobby" })}>
            Annuler
          </button>
        ) : (
          <div className="actions">
            <button type="button" className="primary" onClick={() => store.send({ type: "queue_join" })}>
              Trouver une partie
            </button>
            <button type="button" onClick={() => store.send({ type: "create_room" })}>
              Créer une salle privée
            </button>
            <form
              className="join"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) store.send({ type: "join_room", code: code.trim() });
              }}
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Code de salle"
                aria-label="Code de salle"
                maxLength={8}
              />
              <button type="submit" disabled={!code.trim()}>
                Rejoindre
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>
          Votre deck <small>({deck.length}/7)</small>
        </h2>
        <div className="skill-grid">
          {deck.map((skill) => (
            <SkillCard key={skill} skill={skill} />
          ))}
        </div>
      </section>
    </main>
  );
}
