import { useEffect, useState } from "react";
import type { DeckSelectInfo, SkillId } from "../protocol";
import { skillInfo } from "../skills";
import { store } from "../store";
import { Wordmark, initialOf } from "../ui/NavBar";
import { SkillCard } from "./SkillCard";
import "./deck.css";

export function DeckSelect({ info }: { info: DeckSelectInfo }) {
  const [picked, setPicked] = useState<SkillId[]>([]);
  const [left, setLeft] = useState(info.seconds);

  useEffect(() => {
    setPicked([]);
    setLeft(info.seconds);
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [info.game_id, info.seconds]);

  const classic = info.deck.filter((s) => !skillInfo(s).unique);
  const unique = info.deck.filter((s) => skillInfo(s).unique);

  const toggle = (skill: SkillId) =>
    setPicked((cur) =>
      cur.includes(skill) ? cur.filter((s) => s !== skill) : cur.length < info.max_picks ? [...cur, skill] : cur,
    );

  const opp = info.opponent;
  const isBot = opp.bot === true;
  const oppName = opp.username ?? (isBot ? "Sage" : "Invité");
  const share = info.seconds > 0 ? Math.max(0, Math.min(1, left / info.seconds)) : 0;
  const urgent = left <= 10;

  return (
    <main className="dk-page">
      <div className="dk-top">
        <Wordmark />
      </div>
      <header className="dk-head">
        <div>
          <p className="eyebrow">
            Sélection · vous jouez les {info.you === "white" ? "blancs" : "noirs"}
          </p>
          <h1 className="dk-title">Choisissez vos compétences</h1>
          <p className="muted dk-sub">
            Jusqu'à {info.max_picks} compétences pour cette partie ; vos compétences uniques s'ajoutent sans compter dans le quota.
          </p>
        </div>
        <div className="card dk-opp" aria-label="Adversaire">
          <span className="avatar">{initialOf(oppName)}</span>
          <div className="dk-opp-txt">
            <span className="dk-opp-name">
              {oppName}
              {isBot && opp.elo !== null && <span className="mono muted"> · {opp.elo}</span>}
            </span>
            <span className="muted dk-opp-meta">
              {isBot ? (
                "partie d'entraînement"
              ) : (
                <>
                  {opp.elo !== null ? (
                    <>
                      <span className="mono">{opp.elo}</span> Elo ·{" "}
                    </>
                  ) : null}
                  {info.rated ? "classée" : "amicale"}
                </>
              )}
            </span>
          </div>
          <span className="tag">{isBot ? "IA" : info.rated ? "Classée" : "Amicale"}</span>
        </div>
      </header>

      <div className="dk-timer" role="timer" aria-label={`Temps restant : ${left} secondes`}>
        <div className="dk-timer-bar" aria-hidden="true">
          <i className={urgent ? "urgent" : ""} style={{ transform: `scaleX(${share})` }} />
        </div>
        <span className={`mono dk-timer-num${urgent ? " urgent" : ""}`}>
          0:{String(left).padStart(2, "0")}
        </span>
      </div>

      <section aria-labelledby="dk-classic">
        <div className="dk-sec-head">
          <h2 id="dk-classic" className="dk-h2">
            Compétences classiques
          </h2>
          <span className="mono muted" data-testid="pick-count">
            {picked.length}/{info.max_picks}
          </span>
        </div>
        <div className="dk-grid">
          {classic.map((skill) => {
            const rank = picked.indexOf(skill);
            return (
              <SkillCard
                key={skill}
                skill={skill}
                selected={rank >= 0}
                order={rank >= 0 ? rank + 1 : undefined}
                disabled={info.submitted || (rank < 0 && picked.length >= info.max_picks)}
                onClick={() => toggle(skill)}
              />
            );
          })}
        </div>
      </section>

      {unique.length > 0 && (
        <section aria-labelledby="dk-unique" className="dk-unique">
          <div className="dk-sec-head">
            <h2 id="dk-unique" className="dk-h2">
              Compétence unique
            </h2>
            <span className="muted">toujours incluse</span>
          </div>
          <div className="dk-grid">
            {unique.map((skill) => (
              <SkillCard key={skill} skill={skill} locked />
            ))}
          </div>
        </section>
      )}

      <footer className="dk-foot">
        <button type="button" className="btn ghost" onClick={() => store.send({ type: "leave_deck_select" })}>
          {info.opponent.bot ? "Annuler" : "Quitter"}
        </button>
        {info.submitted ? (
          <p className="dk-wait" role="status">
            Sélection envoyée. En attente de l'adversaire…
          </p>
        ) : (
          <>
            <p className="muted">
              {picked.length === 0
                ? "Vous pouvez aussi commencer sans compétence classique."
                : `${picked.length} compétence${picked.length > 1 ? "s" : ""} sélectionnée${picked.length > 1 ? "s" : ""}.`}
            </p>
            <button type="button" className="btn pri" onClick={() => store.send({ type: "select_deck", skills: picked })}>
              Valider mon deck
            </button>
          </>
        )}
      </footer>
    </main>
  );
}
