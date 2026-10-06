import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhaserBoard } from "../game/PhaserBoard";
import { appendLog, describeAction, launchOf, type LogLine } from "../game/logic";
import { click, highlights, IDLE, startSkill, type Interaction, type PendingPromotion } from "../interaction";
import { describeOutcome } from "../outcome";
import type { SkillId, Square, StateView } from "../protocol";
import { skillName } from "../skills";
import { store, useAppState } from "../store";
import { Wordmark } from "../ui/NavBar";
import { LaunchCard, PromotionPicker, ResultPanel } from "./game/Overlays";
import { EvalBar, Plate } from "./game/Plate";
import { Actions, Chat, Journal, SkillList } from "./game/SidePanels";
import "./game.css";

const LAUNCH_MS = 2500; // 0,55 s de délai (on voit d'abord l'effet sur le plateau) + 1,9 s de carte

interface Launch {
  key: number;
  skill: string;
  mine: boolean;
}

export function Game({ view }: { view: StateView }) {
  const { over, chat, rematch, account } = useAppState();
  const [interaction, setInteraction] = useState<Interaction>(IDLE);
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [resultHidden, setResultHidden] = useState(false);

  // Instant de réception de la position : base de l'interpolation des horloges.
  const stamp = useMemo(() => performance.now(), [view.clock]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new position invalidates whatever was half-selected.
  useEffect(() => {
    setInteraction(IDLE);
    setPromotion(null);
  }, [view.game_id, view.ply]);

  // Journal : une ligne par action, remis à zéro à chaque nouvelle partie.
  const logGame = useRef(view.game_id);
  useEffect(() => {
    const fresh = logGame.current !== view.game_id;
    logGame.current = view.game_id;
    if (fresh) setResultHidden(false);
    setLog((cur) => appendLog(fresh ? [] : cur, describeAction(view)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.game_id, view.ply]);

  // Carte de lancement : seulement pour les compétences lancées pendant qu'on regarde la partie.
  const seen = useRef<{ game: string; ply: number } | null>(null);
  const launchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const prev = seen.current;
    seen.current = { game: view.game_id, ply: view.ply };
    if (!prev || prev.game !== view.game_id || prev.ply === view.ply) return;
    const cast = launchOf(view);
    if (!cast) return;
    if (launchTimer.current) clearTimeout(launchTimer.current);
    setLaunch({ key: view.ply, skill: cast.skill, mine: cast.color === view.you });
    launchTimer.current = setTimeout(() => setLaunch(null), LAUNCH_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.game_id, view.ply]);
  useEffect(() => {
    return () => {
      if (launchTimer.current) clearTimeout(launchTimer.current);
    };
  }, []);

  const over_ = view.outcome.type !== "ongoing";
  const myTurn = view.to_move === view.you && !over_;
  const activeSkill = interaction.kind === "skill" ? interaction.skill : null;

  const toggleSkill = useCallback(
    (skill: SkillId) => setInteraction((cur) => (cur.kind === "skill" && cur.skill === skill ? IDLE : startSkill(view, skill))),
    [view],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") {
        setInteraction(IDLE);
        setPromotion(null);
      } else if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const slot = view.my_skills[Number(e.key) - 1];
        if (slot && !slot.used) toggleSkill(slot.skill);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, toggleSkill]);

  const onSquare = useCallback(
    (square: Square) => {
      if (promotion) return;
      const result = click(view, interaction, square);
      setInteraction(result.interaction);
      if (result.promotion) setPromotion(result.promotion);
      if (result.send) store.send({ type: "action", action: result.send });
    },
    [view, interaction, promotion],
  );

  const hl = useMemo(() => highlights(view, interaction), [view, interaction]);

  const opp = view.opponent;
  const oppName = opp.username ?? "Invité";
  const opponentColor = view.you === "white" ? "black" : "white";
  const myUsed = view.my_skills.filter((s) => s.used).map((s) => s.skill);

  let hint: string;
  let tone = "";
  if (over_) {
    hint = describeOutcome(view.outcome, view.you);
  } else if (promotion) {
    hint = "Choisissez la pièce de promotion.";
  } else if (activeSkill) {
    hint = `${skillName(activeSkill)} : ${interaction.kind === "skill" && interaction.first !== null ? "choisissez la case de destination." : "choisissez une pièce ou une case en surbrillance."}`;
    tone = "skill";
  } else if (!view.opponent_connected) {
    hint = "L'adversaire s'est déconnecté. Il a 60 s pour revenir.";
    tone = "warn";
  } else if (view.in_check && myTurn) {
    hint = "Échec : protégez votre roi.";
    tone = "check";
  } else if (view.draw_offer === "them") {
    hint = "Votre adversaire propose la nulle.";
  } else {
    hint = myTurn ? "À vous de jouer. Sélectionnez une pièce ou une compétence." : "Tour de l'adversaire…";
  }

  return (
    <div className="gm">
      <header className="gm-top">
        <Wordmark />
        <div className="gm-top-mid">
          <span className="tag">{view.rated ? "Classée" : "Amicale"}</span>
          <span className="mono muted">Demi-coup {view.ply}</span>
        </div>
        <span className="gm-you muted">
          Vous jouez les {view.you === "white" ? "blancs" : "noirs"}
        </span>
      </header>

      <main className="gm-grid">
        <aside className="gm-left">
          <SkillList slots={view.my_skills} view={view} myTurn={myTurn} active={activeSkill} onToggle={toggleSkill} />
          {view.my_skills.length > 0 && (
            <p className="muted gm-tip">
              {view.my_skills.length === 1 ? "Touche 1" : `Touches 1 à ${view.my_skills.length}`} pour armer une
              compétence, Échap pour annuler.
            </p>
          )}
        </aside>

        <section className="gm-center" aria-label="Plateau">
          <Plate
            name={oppName}
            elo={opp.elo}
            color={opponentColor}
            board={view.board}
            clock={view.clock}
            stamp={stamp}
            active={view.to_move === opponentColor && !over_}
            used={view.opponent_skills.used}
            remaining={Math.max(0, view.opponent_skills.total - view.opponent_skills.used.length)}
            disconnected={!view.opponent_connected && !over_}
            clockLabel="Horloge de l'adversaire"
          />

          <div className={`gm-hint ${tone}`} role="status" aria-live="polite">
            <span>{hint}</span>
            {activeSkill && (
              <button type="button" className="btn sm ghost" onClick={() => setInteraction(IDLE)}>
                Annuler
              </button>
            )}
            {over_ && resultHidden && (
              <button type="button" className="btn sm" onClick={() => setResultHidden(false)}>
                Voir le résultat
              </button>
            )}
          </div>

          <div className="gm-boardrow">
            <EvalBar view={view} />
            <div className="gm-board">
              <PhaserBoard view={view} highlights={hl} onSquare={onSquare} />
              {launch && <LaunchCard key={launch.key} skill={launch.skill} mine={launch.mine} />}
              {promotion && (
                <PromotionPicker
                  options={promotion.options}
                  onCancel={() => setPromotion(null)}
                  onPick={(kind) => {
                    store.send({ type: "action", action: { type: "move", from: promotion.from, to: promotion.to, promo: kind } });
                    setPromotion(null);
                  }}
                />
              )}
              {over_ && !resultHidden && (
                <ResultPanel
                  outcome={view.outcome}
                  you={view.you}
                  rated={over?.rated ?? view.rated}
                  elo={over?.elo ?? null}
                  rematch={rematch}
                  onHide={() => setResultHidden(true)}
                />
              )}
            </div>
          </div>

          <Plate
            name={account && !account.guest && account.username ? account.username : "Vous"}
            elo={account && !account.guest ? account.elo : null}
            color={view.you}
            board={view.board}
            clock={view.clock}
            stamp={stamp}
            active={myTurn}
            used={myUsed}
            remaining={view.my_skills.length - myUsed.length}
            you
            clockLabel="Votre horloge"
          />
        </section>

        <aside className="gm-right">
          <Actions view={view} over={over_} />
          <Journal log={log} you={view.you} />
          <Chat lines={chat} />
        </aside>
      </main>
    </div>
  );
}
