import { useEffect, useMemo, useRef, useState } from "react";
import { actorOf, type LogLine } from "../game/logic";
import type { Color } from "../protocol";
import { COLOR_FR, colorOf, defaultOrientation, endSound, kindLabel, opposite, seatName, spectatorToView } from "../replay/frames";
import { delayText, neutralReason, outcomeWinner, plyText, resultLine, spectatorsText, winnerText } from "../replay/lists";
import { endedText, spectateErrorText, spectatorKey, type SpectatingState } from "../replay/spectator";
import { sfx } from "../sound";
import { store, useAppState } from "../store";
import { SkillArt } from "../ui/SkillArt";
import { EvalBar, Plate } from "./game/Plate";
import { BoardStage } from "./replay/BoardStage";
import { keepVisible } from "./replay/scroll";
import "./game.css";
import "./replay.css";

/** Page `#/watch/<id>` : entre en mode spectateur à l'affichage, le quitte au démontage. */
export function Watch({ gameId }: { gameId: string }) {
  const { spectating } = useAppState();

  useEffect(() => {
    store.spectate(gameId);
    return () => store.unspectate();
  }, [gameId]);

  const s = spectating && spectating.gameId === gameId ? spectating : null;

  if (!s || s.status === "joining") {
    return (
      <main className="rp">
        <div className="rp-state card" role="status" aria-live="polite">
          <span className="rp-spinner" aria-hidden="true" />
          <p>Connexion à la partie…</p>
          <a className="btn sm ghost" href="#/live">
            Annuler
          </a>
        </div>
      </main>
    );
  }
  if (s.status === "error") {
    return (
      <main className="rp">
        <div className="rp-state card" role="alert">
          <h1 className="rp-state-title">Impossible de regarder cette partie</h1>
          <p className="muted">{spectateErrorText(s.error)}</p>
          <div className="gm-row rp-state-actions">
            <a className="btn pri" href="#/live">
              Parties en direct
            </a>
          </div>
        </div>
      </main>
    );
  }
  if (s.status === "ended" && !s.view) {
    return (
      <main className="rp">
        <div className="rp-state card" role="status">
          <h1 className="rp-state-title">{endedText(s.endedReason)}</h1>
          <div className="gm-row rp-state-actions">
            <a className="btn pri" href="#/live">
              Parties en direct
            </a>
          </div>
        </div>
      </main>
    );
  }
  return <Spectator key={gameId} state={s} />;
}

function Spectator({ state }: { state: SpectatingState }) {
  const raw = state.view!;
  const { account } = useAppState();
  const username = account && !account.guest ? account.username : null;
  const [orientation, setOrientation] = useState<Color>(() => defaultOrientation(raw, username));
  const [resultHidden, setResultHidden] = useState(false);

  const view = useMemo(() => spectatorToView(raw, orientation), [raw, orientation]);
  // Instant de réception : base de l'interpolation des horloges.
  const stamp = useMemo(() => performance.now(), [raw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sons : un par action nouvelle, jamais pour l'instantané reçu en entrant dans la partie.
  const key = spectatorKey(raw);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const first = seen.current === null;
    const changed = seen.current !== key;
    seen.current = key;
    if (first || !changed) return;
    sfx.playEvents(raw.events, { me: orientation, actor: actorOf({ events: raw.events, to_move: raw.to_move }) });
    const end = endSound(raw.outcome, colorOf(raw, username) ?? orientation);
    if (end) sfx.play(end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const over = raw.outcome.type !== "ongoing";
  const ended = state.status === "ended";
  const delay = delayText(raw.delay_ms);
  const top = opposite(orientation);
  const title = `${seatName(raw.white)} contre ${seatName(raw.black)}`;
  const finished = over || ended;

  const plate = (color: Color) => ({
    name: seatName(raw[color]),
    elo: raw[color].elo,
    color,
    board: raw.board,
    clock: view.clock,
    clockEnabled: raw.clock_enabled,
    stamp,
    active: raw.to_move === color && !finished,
    used: raw.used[color],
    remaining: 0,
    bot: raw[color].bot,
    clockLabel: `Horloge des ${COLOR_FR[color]}`,
  });

  let hint: string;
  let tone = "";
  if (ended) {
    hint = endedText(state.endedReason);
    tone = "warn";
  } else if (over) hint = resultLine(raw.outcome, "");
  else if (raw.in_check) {
    hint = `Échec : roi ${raw.to_move === "white" ? "blanc" : "noir"} menacé.`;
    tone = "check";
  } else hint = raw.ply === 0 ? "La partie vient de commencer." : `Aux ${COLOR_FR[raw.to_move]} de jouer.`;

  return (
    <main className="rp">
      <header className="rp-head">
        <div className="rp-head-main">
          <p className="eyebrow">{finished ? "Retransmission terminée" : "En direct"}</p>
          <h1 className="rp-title">{title}</h1>
          <p className="rp-meta">
            <span className="tag">{kindLabel(raw.kind, raw.rated)}</span>
            <span className="muted">{plyText(raw.ply)}</span>
            <span className="muted" aria-live="polite">
              {spectatorsText(raw.spectators)}
            </span>
          </p>
        </div>
        <div className="rp-head-actions">
          <button type="button" className="btn sm" onClick={() => setOrientation((o) => opposite(o))} aria-pressed={orientation === "black"}>
            Retourner le plateau
          </button>
          <a className="btn sm" href="#/live">
            Quitter
          </a>
        </div>
      </header>

      <div className="rp-grid">
        <section className="rp-center" aria-label="Plateau">
          <Plate {...plate(top)} />
          <div className={`gm-hint ${tone}`} role="status" aria-live="polite">
            <span>{hint}</span>
            {finished && resultHidden && (
              <button type="button" className="btn sm" onClick={() => setResultHidden(false)}>
                Voir le résultat
              </button>
            )}
          </div>
          <div className="gm-boardrow">
            <EvalBar view={view} />
            <BoardStage view={view} orientation={orientation}>
              {finished && !resultHidden && <SpectatorResult state={state} onHide={() => setResultHidden(true)} />}
            </BoardStage>
          </div>
          <Plate {...plate(orientation)} />
        </section>

        <aside className="rp-side">
          <section className="gm-panel card rp-now" aria-labelledby="rp-live-h">
            <div className="gm-panel-head">
              <h2 id="rp-live-h" className="gm-h">
                Retransmission
              </h2>
            </div>
            <p>{delay ?? "Retransmission en direct, sans délai."}</p>
            {delay && <p className="muted rp-help">Le délai évite que le public ne souffle des coups aux joueurs.</p>}
            <p className="muted rp-help">Les pièges et les pièces sur le banc des joueurs restent cachés aux spectateurs.</p>
          </section>
          <SpectatorLog log={state.log} />
        </aside>
      </div>
    </main>
  );
}

function SpectatorLog({ log }: { log: LogLine[] }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    keepVisible(list.current, null, true);
  }, [log.length]);
  return (
    <section className="gm-panel card gm-journal" aria-labelledby="rp-log-h">
      <div className="gm-panel-head">
        <h2 id="rp-log-h" className="gm-h">
          Coups
        </h2>
        <span className="mono muted">{log.length}</span>
      </div>
      <ol className="gm-log rp-log" ref={list} aria-live="polite">
        {log.length === 0 && <li className="muted gm-empty">Aucun coup vu pour l'instant.</li>}
        {log.map((line) => (
          <li key={line.key ?? line.ply}>
            <span className="mono gm-log-n">{line.ply}</span>
            <span className="gm-log-who">{line.actor === "white" ? "Blancs" : "Noirs"}</span>
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
      </ol>
    </section>
  );
}

function SpectatorResult({ state, onHide }: { state: SpectatingState; onHide: () => void }) {
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const view = state.view!;
  const cancelled = state.status === "ended";
  const winner = outcomeWinner(view.outcome);
  return (
    <div className="gm-veil" role="dialog" aria-modal="true" aria-labelledby="sp-res-title">
      <div className="gm-result card">
        <p className="eyebrow">{cancelled ? "Partie annulée" : "Partie terminée"}</p>
        <h2 id="sp-res-title" className="gm-result-title">
          {cancelled ? "Annulée" : winnerText(winner ?? null)}
        </h2>
        <p className="muted">{cancelled ? endedText(state.endedReason) : neutralReason(view.outcome.type)}</p>
        <div className="gm-result-actions">
          {!cancelled && (
            <a className="btn pri" ref={first} href={`#/replay/${encodeURIComponent(view.game_id)}`}>
              Voir le replay
            </a>
          )}
          <div className="gm-result-row">
            <button type="button" className="btn ghost" onClick={onHide}>
              Revoir l'échiquier
            </button>
            <a className="btn ghost" href="#/live">
              Parties en direct
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
