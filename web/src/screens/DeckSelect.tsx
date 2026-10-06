import { useEffect, useState } from "react";
import type { DeckSelectInfo, SkillId } from "../protocol";
import { SKILLS } from "../skills";
import { store } from "../store";
import { SkillCard } from "./SkillCard";

export function DeckSelect({ info }: { info: DeckSelectInfo }) {
  const [picked, setPicked] = useState<SkillId[]>([]);
  const [left, setLeft] = useState(info.seconds);

  useEffect(() => {
    setLeft(info.seconds);
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [info.game_id, info.seconds]);

  const classic = info.deck.filter((s) => !SKILLS[s].unique);
  const unique = info.deck.filter((s) => SKILLS[s].unique);

  const toggle = (skill: SkillId) =>
    setPicked((cur) =>
      cur.includes(skill) ? cur.filter((s) => s !== skill) : cur.length < info.max_picks ? [...cur, skill] : cur,
    );

  return (
    <main className="screen">
      <h1>Choisissez vos compétences</h1>
      <p className="lead">
        Vous jouez les {info.you === "white" ? "blancs" : "noirs"}. Maximum {info.max_picks} compétences, plus vos
        compétences uniques. Temps restant : <strong>{left}s</strong>
      </p>

      <section className="panel">
        <h2>
          Compétences classiques{" "}
          <small data-testid="pick-count">
            ({picked.length}/{info.max_picks})
          </small>
        </h2>
        <div className="skill-grid">
          {classic.map((skill) => (
            <SkillCard
              key={skill}
              skill={skill}
              selected={picked.includes(skill)}
              disabled={info.submitted}
              onClick={() => toggle(skill)}
            />
          ))}
        </div>
      </section>

      {unique.length > 0 && (
        <section className="panel">
          <h2>Compétences uniques</h2>
          <div className="skill-grid">
            {unique.map((skill) => (
              <SkillCard key={skill} skill={skill} badge="toujours incluse" />
            ))}
          </div>
        </section>
      )}

      {info.submitted ? (
        <p className="status">En attente de l'adversaire…</p>
      ) : (
        <button
          type="button"
          className="primary"
          onClick={() => store.send({ type: "select_deck", skills: picked })}
        >
          Valider
        </button>
      )}
    </main>
  );
}
