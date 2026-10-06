import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhaserBoard } from "../game/PhaserBoard";
import { actionKey, appendLog, describeAction, launchOf, type LogLine } from "../game/logic";
import {
  activateSkill,
  cancelSpawn,
  chooseSpawn,
  click,
  clickRejected,
  dragStart,
  dropOn,
  highlights,
  IDLE,
  targetHint,
  targetShape,
  type Interaction,
  type PendingPromotion,
  type PendingSpawn,
} from "../interaction";
import { describeOutcome } from "../outcome";
import type { SkillId, SpawnKind, Square, StateView } from "../protocol";
import {
  premoveAllowed,
  premoveClick,
  premoveDragStart,
  premoveHighlights,
  premoveStillPossible,
  resolvePremove,
  type Premove,
  type PremoveClick,
} from "../premove";
import { skillName } from "../skills";
import { sfx } from "../sound";
import { store, useAppState } from "../store";
import { useTheme } from "../theme";
import { Wordmark } from "../ui/NavBar";
import { LaunchCard, PromotionPicker, ResultPanel, SpawnPicker } from "./game/Overlays";
import { EvalBar, Plate } from "./game/Plate";
import { Actions, BenchPanel, Chat, Journal, SkillList, TrainingNote } from "./game/SidePanels";
import { useGameSounds } from "./game/useGameSounds";
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
  const [spawn, setSpawn] = useState<PendingSpawn | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [resultHidden, setResultHidden] = useState(false);
  // Premove : un coup posé pendant le tour de l'adversaire (`failed` : il n'est plus jouable, clignote puis disparaît).
  const [premove, setPremove] = useState<(Premove & { failed?: boolean }) | null>(null);
  const [premoveSel, setPremoveSel] = useState<Square | null>(null);
  const [premovePromo, setPremovePromo] = useState<PendingPromotion | null>(null);
  const theme = useTheme();

  // Instant de réception de la position : base de l'interpolation des horloges.
  const stamp = useMemo(() => performance.now(), [view.clock]); // eslint-disable-line react-hooks/exhaustive-deps

  // Empreinte de la dernière action : change à chaque coup *et* à chaque Mind Reading/Control, qui
  // laissent le demi-coup (et le trait) inchangés, mais pas quand la même position est renvoyée.
  const action = actionKey(view);

  useGameSounds(view, action, over?.outcome ?? null, stamp);

  // A new position invalidates whatever was half-selected.
  useEffect(() => {
    setInteraction(IDLE);
    setPromotion(null);
    setSpawn(null);
    setPremoveSel(null);
    setPremovePromo(null);
  }, [view.game_id, action]);

  // Premove : au début de notre tour, il part tout de suite s'il est légal, sinon il est abandonné en silence
  // (léger clignotement et buzz discret). Il tombe aussi si la partie finit ou si sa pièce a disparu.
  const premoveRef = useRef(premove);
  premoveRef.current = premove;
  const premoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setPremove(null);
  }, [view.game_id]);
  useEffect(() => {
    const pm = premoveRef.current;
    if (!pm || pm.failed) return;
    if (view.to_move === view.you && view.outcome.type === "ongoing") {
      const r = resolvePremove(view, pm);
      if (r.action === "send") {
        store.send({ type: "action", action: { type: "move", ...r.move } });
        setPremove(null);
      } else {
        sfx.play("illegal", { volume: 0.5 });
        setPremove({ ...pm, failed: true });
        if (premoveTimer.current) clearTimeout(premoveTimer.current);
        premoveTimer.current = setTimeout(() => setPremove(null), 480);
      }
    } else if (!premoveStillPossible(view, pm)) {
      setPremove(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.game_id, action]);
  useEffect(
    () => () => {
      if (premoveTimer.current) clearTimeout(premoveTimer.current);
    },
    [],
  );

  // Journal : une ligne par action, remis à zéro à chaque nouvelle partie.
  const logGame = useRef(view.game_id);
  useEffect(() => {
    const fresh = logGame.current !== view.game_id;
    logGame.current = view.game_id;
    if (fresh) setResultHidden(false);
    const line = describeAction(view);
    setLog((cur) => appendLog(fresh ? [] : cur, line && { ...line, key: action }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.game_id, action]);

  // Carte de lancement : seulement pour les compétences lancées pendant qu'on regarde la partie.
  const seen = useRef<{ game: string; action: string } | null>(null);
  const launchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const prev = seen.current;
    seen.current = { game: view.game_id, action };
    if (!prev || prev.game !== view.game_id || prev.action === action) return;
    const cast = launchOf(view);
    if (!cast) return;
    if (launchTimer.current) clearTimeout(launchTimer.current);
    setLaunch({ key: Date.now(), skill: cast.skill, mine: cast.color === view.you });
    launchTimer.current = setTimeout(() => setLaunch(null), LAUNCH_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.game_id, action]);
  useEffect(() => {
    return () => {
      if (launchTimer.current) clearTimeout(launchTimer.current);
    };
  }, []);

  const over_ = view.outcome.type !== "ongoing";
  const myTurn = view.to_move === view.you && !over_;
  const ended = over_ || over !== null;
  useEffect(() => {
    if (ended || !theme.premove) {
      setPremove(null);
      setPremoveSel(null);
      setPremovePromo(null);
    }
  }, [ended, theme.premove]);
  // Pendant le tour adverse (partie en cours), le plateau sert à poser un premove.
  const premoving = !ended && premoveAllowed(view, theme.premove);

  const cancelPremove = useCallback(() => {
    setPremove(null);
    setPremoveSel(null);
    setPremovePromo(null);
  }, []);
  const applyPremoveClick = useCallback((r: PremoveClick) => {
    setPremoveSel(r.selected);
    if (r.cancel) setPremove(null);
    if (r.set) {
      setPremove(r.set);
      sfx.play("ui_click");
    }
    if (r.promotion) setPremovePromo(r.promotion);
  }, []);
  const activeSkill = interaction.kind === "skill" ? interaction.skill : null;

  // Une compétence sans cible (Tornado, Wall, Mind Reading…) part tout de suite ; les autres arment le ciblage.
  const toggleSkill = useCallback(
    (skill: SkillId) => {
      const result = activateSkill(view, interaction, skill);
      setSpawn(null);
      setInteraction(result.interaction);
      if (result.send) store.send({ type: "action", action: result.send });
    },
    [view, interaction],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") {
        setInteraction(IDLE);
        setPromotion(null);
        setSpawn(null);
        setPremove(null);
        setPremoveSel(null);
        setPremovePromo(null);
      } else if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const slot = view.my_skills[Number(e.key) - 1];
        if (slot && !slot.used && !promotion && !spawn) toggleSkill(slot.skill);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, toggleSkill, promotion, spawn]);

  const onSquare = useCallback(
    (square: Square) => {
      if (promotion || spawn || premovePromo) return;
      if (premoving) {
        applyPremoveClick(premoveClick(view, premoveSel, square, theme.premove));
        return;
      }
      if (clickRejected(view, interaction, square, theme.premove)) sfx.play("illegal", { volume: 0.6 });
      const result = click(view, interaction, square);
      setInteraction(result.interaction);
      if (result.promotion) setPromotion(result.promotion);
      if (result.spawn) setSpawn(result.spawn);
      if (result.send) store.send({ type: "action", action: result.send });
    },
    [view, interaction, promotion, spawn, premovePromo, premoving, premoveSel, theme.premove, applyPremoveClick],
  );

  // Glisser-déposer : un glisser est un clic sur la case de départ puis sur celle d'arrivée.
  const canDrag = useCallback(
    (square: Square) => {
      if (promotion || spawn || premovePromo) return false;
      return premoving ? premoveDragStart(view, square, theme.premove) : dragStart(view, interaction, square) !== null;
    },
    [view, interaction, promotion, spawn, premovePromo, premoving, theme.premove],
  );
  const onDragStart = useCallback(
    (square: Square) => {
      if (premoving) {
        setPremoveSel(square);
        return;
      }
      const next = dragStart(view, interaction, square);
      if (next) setInteraction(next);
    },
    [view, interaction, premoving],
  );
  const onDrop = useCallback(
    (from: Square, to: Square | null): "snap" | "return" => {
      if (premoving) {
        if (to === null) {
          setPremoveSel(null);
        } else if (to === from) {
          setPremoveSel(from);
        } else {
          const r = premoveClick(view, from, to, theme.premove);
          if (r.set || r.promotion) applyPremoveClick(r);
          else {
            setPremoveSel(null);
            sfx.play("illegal", { volume: 0.6 });
          }
        }
        return "return";
      }
      if (to === null) {
        setInteraction(interaction.kind === "idle" ? IDLE : { kind: "skill", skill: interaction.skill, first: null });
        return "return";
      }
      const d = dropOn(view, interaction, from, to);
      setInteraction(d.result.interaction);
      if (d.result.promotion) setPromotion(d.result.promotion);
      if (d.result.send) store.send({ type: "action", action: d.result.send });
      if (d.rejected) sfx.play("illegal", { volume: 0.6 });
      return d.verdict;
    },
    [view, interaction, premoving, theme.premove, applyPremoveClick],
  );

  const pickSpawn = useCallback(
    (kind: SpawnKind) => {
      if (!spawn) return;
      const result = chooseSpawn(spawn, kind);
      setSpawn(null);
      setInteraction(result.interaction);
      if (result.send) store.send({ type: "action", action: result.send });
    },
    [spawn],
  );

  const cancelSpawnPick = useCallback(() => {
    if (!spawn) return;
    setInteraction(cancelSpawn(spawn));
    setSpawn(null);
  }, [spawn]);

  const hl = useMemo(
    () => (premoving ? premoveHighlights(view, premoveSel) : highlights(view, interaction)),
    [view, interaction, premoving, premoveSel],
  );

  const opp = view.opponent;
  const isBot = opp.bot === true;
  const clockEnabled = view.clock_enabled !== false;
  const oppName = opp.username ?? (isBot ? "Sage" : "Invité");
  const opponentColor = view.you === "white" ? "black" : "white";
  const myUsed = view.my_skills.filter((s) => s.used).map((s) => s.skill);

  let hint: string;
  let tone = "";
  if (over_) {
    hint = describeOutcome(view.outcome, view.you);
  } else if (promotion) {
    hint = "Choisissez la pièce de promotion.";
  } else if (activeSkill) {
    const first = interaction.kind === "skill" ? interaction.first : null;
    hint = `${skillName(activeSkill)} : ${targetHint(targetShape(view, activeSkill), first, spawn !== null)}`;
    tone = "skill";
  } else if (!view.opponent_connected) {
    hint = "L'adversaire s'est déconnecté. Il a 60 s pour revenir.";
    tone = "warn";
  } else if (view.in_check && myTurn) {
    hint = "Échec : protégez votre roi.";
    tone = "check";
  } else if (myTurn && view.events.some((e) => e.type === "skill_used" && e.color === view.you && (e.skill === "mind" || e.skill === "control"))) {
    hint = "Vous avez gardé la main : jouez un coup (ou une autre compétence).";
  } else if (view.draw_offer === "them") {
    hint = "Votre adversaire propose la nulle.";
  } else {
    hint = myTurn
        ? "À vous de jouer. Sélectionnez une pièce ou une compétence."
        : isBot
          ? `${oppName} réfléchit…`
          : premove && !premove.failed
            ? "Premove posé : il partira dès votre tour."
            : theme.premove
              ? "Tour de l'adversaire… Vous pouvez préparer un coup."
              : "Tour de l'adversaire…";
  }

  return (
    <div className="gm">
      <header className="gm-top">
        <Wordmark />
        <div className="gm-top-mid">
          <span className="tag">{isBot ? "Entraînement" : view.rated ? "Classée" : "Amicale"}</span>
          <span className="mono muted">Demi-coup {view.ply}</span>
        </div>
        <span className="gm-you muted">
          Vous jouez les {view.you === "white" ? "blancs" : "noirs"}
        </span>
      </header>

      <main className="gm-grid">
        <aside className="gm-left">
          <SkillList slots={view.my_skills} view={view} myTurn={myTurn} active={activeSkill} onToggle={toggleSkill} />
          <BenchPanel pieces={view.benched} />
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
            rivalBench={view.benched}
            clock={view.clock}
            clockEnabled={clockEnabled}
            bot={isBot}
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
            {premove && !premove.failed && !over_ && (
              <button type="button" className="btn sm ghost gm-premove-x" onClick={cancelPremove}>
                Annuler le premove
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
              <PhaserBoard
                view={view}
                highlights={hl}
                onSquare={onSquare}
                canDrag={canDrag}
                onDragStart={onDragStart}
                onDrop={onDrop}
                premove={premove}
                onCancelPremove={cancelPremove}
              />
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
              {premovePromo && (
                <PromotionPicker
                  options={premovePromo.options}
                  onCancel={cancelPremove}
                  onPick={(kind) => {
                    setPremove({ from: premovePromo.from, to: premovePromo.to, promo: kind });
                    setPremovePromo(null);
                    sfx.play("ui_click");
                  }}
                />
              )}
              {spawn && <SpawnPicker skill={spawn.skill} options={spawn.options} onPick={pickSpawn} onCancel={cancelSpawnPick} />}
              {over_ && !resultHidden && (
                <ResultPanel
                  outcome={view.outcome}
                  you={view.you}
                  rated={over?.rated ?? view.rated}
                  solo={isBot}
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
            ownBench={view.benched}
            clock={view.clock}
            clockEnabled={clockEnabled}
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
          {isBot ? <TrainingNote /> : <Chat lines={chat} />}
        </aside>
      </main>
    </div>
  );
}
