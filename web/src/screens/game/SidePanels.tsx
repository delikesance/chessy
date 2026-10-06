import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { LogLine } from "../../game/logic";
import type { SkillSlot, StateView } from "../../protocol";
import { skillInfo } from "../../skills";
import { store, type ChatLine } from "../../store";
import { SkillArt } from "../../ui/SkillArt";

interface SkillListProps {
  slots: SkillSlot[];
  view: StateView;
  myTurn: boolean;
  active: string | null;
  onToggle: (skill: SkillSlot["skill"]) => void;
}

/** Les compétences du joueur : un clic lance le ciblage. */
export function SkillList({ slots, view, myTurn, active, onToggle }: SkillListProps) {
  const options = (skill: string) => view.skill_options.find((o) => o.skill === skill)?.targets.length ?? 0;
  return (
    <section className="gm-panel card" aria-labelledby="gm-skills-h">
      <div className="gm-panel-head">
        <h2 id="gm-skills-h" className="gm-h">
          Vos compétences
        </h2>
        <span className="mono muted">{slots.filter((s) => !s.used).length}/{slots.length}</span>
      </div>
      {slots.length === 0 && <p className="muted gm-empty">Aucune compétence dans cette partie.</p>}
      <ul className="gm-skills">
        {slots.map((slot, i) => {
          const info = skillInfo(slot.skill);
          const n = options(slot.skill);
          const usable = myTurn && !slot.used && n > 0;
          const status = slot.used ? "Utilisée" : !myTurn ? "À votre tour" : n === 0 ? "Aucune cible" : "1 usage";
          const on = active === slot.skill;
          return (
            <li key={slot.skill}>
              <button
                type="button"
                className={`gm-skill${on ? " on" : ""}${slot.used ? " used" : ""}`}
                style={{ "--fam": `var(--fam-${info.family})` } as CSSProperties}
                disabled={!usable}
                aria-pressed={on}
                aria-keyshortcuts={String(i + 1)}
                title={info.description}
                onClick={() => onToggle(slot.skill)}
              >
                <span className="gm-skill-art">
                  <SkillArt id={slot.skill} size={36} />
                </span>
                <span className="gm-skill-txt">
                  <span className="gm-skill-name">
                    {info.name}
                    {info.unique && <span className="tag">unique</span>}
                  </span>
                  <span className="gm-skill-status muted">{status}</span>
                </span>
                <span className="gm-skill-key mono" aria-hidden="true">
                  {i + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Journal({ log, you }: { log: LogLine[]; you: StateView["you"] }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [log.length]);
  return (
    <section className="gm-panel card gm-journal" aria-labelledby="gm-journal-h">
      <div className="gm-panel-head">
        <h2 id="gm-journal-h" className="gm-h">
          Journal
        </h2>
        <span className="mono muted">{log.length}</span>
      </div>
      <ol className="gm-log">
        {log.length === 0 && <li className="muted gm-empty">Aucune action pour l'instant.</li>}
        {log.map((line) => (
          <li key={line.ply} className={line.actor === you ? "me" : "opp"}>
            <span className="mono gm-log-n">{line.ply}</span>
            <span className="gm-log-who">{line.actor === you ? "Vous" : "Adv."}</span>
            <span className="gm-log-text">
              {line.skill && (
                <span className="gm-log-ico">
                  <SkillArt id={line.skill} size={16} />
                </span>
              )}
              {line.text}
            </span>
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ol>
    </section>
  );
}

export function Actions({ view, over }: { view: StateView; over: boolean }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setConfirm(false);
  }, [view.game_id, over]);
  if (over) return null;
  return (
    <section className="gm-panel card gm-actions" aria-label="Actions de partie">
      {view.draw_offer === "them" && (
        <div className="gm-banner" role="alert">
          <strong>Nulle proposée</strong>
          <span className="muted">L'adversaire vous propose la nulle.</span>
          <div className="gm-row">
            <button type="button" className="btn sm pri" onClick={() => store.respondDraw(true)}>
              Accepter
            </button>
            <button type="button" className="btn sm" onClick={() => store.respondDraw(false)}>
              Refuser
            </button>
          </div>
        </div>
      )}
      {confirm ? (
        <div className="gm-banner danger" role="alertdialog" aria-label="Confirmer l'abandon">
          <strong>Abandonner la partie ?</strong>
          <span className="muted">Votre adversaire sera déclaré vainqueur.</span>
          <div className="gm-row">
            <button type="button" className="btn sm danger" onClick={() => store.send({ type: "resign" })} autoFocus>
              Oui, abandonner
            </button>
            <button type="button" className="btn sm" onClick={() => setConfirm(false)}>
              Continuer
            </button>
          </div>
        </div>
      ) : (
        <div className="gm-row">
          <button type="button" className="btn sm danger" onClick={() => setConfirm(true)}>
            Résigner
          </button>
          <button type="button" className="btn sm" disabled={view.draw_offer !== "none"} onClick={() => store.offerDraw()}>
            {view.draw_offer === "you" ? "Nulle proposée" : "Proposer nulle"}
          </button>
        </div>
      )}
    </section>
  );
}

const QUICK = ["Bien joué !", "Merci", "Bonne chance", "Oups…", "Belle compétence"];

export function Chat({ lines }: { lines: ChatLine[] }) {
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const send = (t: string) => {
    const clean = t.trim();
    if (clean) store.send({ type: "chat", text: clean.slice(0, 140) });
  };

  return (
    <section className="gm-panel card gm-chat" aria-labelledby="gm-chat-h">
      <h2 id="gm-chat-h" className="gm-h">
        Chat
      </h2>
      <div className="gm-chat-list" ref={list} role="log" aria-live="polite">
        {lines.length === 0 && <p className="muted gm-empty">Dites bonjour avec une phrase rapide.</p>}
        {lines.map((l, i) => (
          <p key={i} className={`gm-msg ${l.mine ? "me" : "opp"}`}>
            <span className="sr-only">{l.mine ? "Vous : " : "Adversaire : "}</span>
            {l.text}
          </p>
        ))}
      </div>
      <div className="gm-quick">
        {QUICK.map((q) => (
          <button key={q} type="button" className="gm-chip" onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="gm-chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
          setText("");
        }}
      >
        <label className="sr-only" htmlFor="gm-chat-input">
          Message
        </label>
        <input id="gm-chat-input" className="input" value={text} maxLength={140} placeholder="Votre message" onChange={(e) => setText(e.target.value)} autoComplete="off" />
        <button type="submit" className="btn sm" disabled={!text.trim()}>
          Envoyer
        </button>
      </form>
    </section>
  );
}
