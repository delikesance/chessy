import { lazy, Suspense, useEffect } from "react";
import { DeckSelect } from "./screens/DeckSelect";
import { Lobby } from "./screens/Lobby";
import { RewardModal } from "./screens/RewardModal";
import { store, useAppState } from "./store";

// Phaser is large; only load it once a game starts.
const Game = lazy(() => import("./screens/Game").then((m) => ({ default: m.Game })));

export function App() {
  const state = useAppState();

  useEffect(() => {
    store.connect();
    return () => store.disconnect();
  }, []);

  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(() => store.dismissToast(), 4000);
    return () => clearTimeout(timer);
  }, [state.toast]);

  const reward = state.over?.reward ?? state.pendingReward;

  let screen;
  if (state.connection === "replaced") {
    screen = (
      <main className="screen">
        <h1>Chessy</h1>
        <p className="lead">Ce compte est utilisé dans un autre onglet. Fermez celui-ci ou rechargez la page.</p>
      </main>
    );
  } else if (state.game) {
    screen = (
      <Suspense fallback={<p className="lead">Chargement…</p>}>
        <Game view={state.game} />
      </Suspense>
    );
  } else if (state.deckSelect) {
    screen = <DeckSelect info={state.deckSelect} />;
  } else {
    screen = <Lobby state={state} />;
  }

  return (
    <>
      {state.connection === "closed" && <div className="banner">Connexion perdue, nouvelle tentative…</div>}
      {screen}
      {reward && <RewardModal offer={reward} />}
      {state.toast && (
        <div className="toast" role="status" key={state.toast.id}>
          {state.toast.text}
        </div>
      )}
    </>
  );
}
