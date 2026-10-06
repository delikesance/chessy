import { lazy, Suspense, useEffect } from "react";
import { useRoute } from "./router";
import { Auth } from "./screens/Auth";
import { Collection } from "./screens/Collection";
import { DeckSelect } from "./screens/DeckSelect";
import { Friends } from "./screens/Friends";
import { Lobby } from "./screens/Lobby";
import { Profile } from "./screens/Profile";
import { Ranking } from "./screens/Ranking";
import { RewardModal } from "./screens/RewardModal";
import { store, useAppState } from "./store";
import { ChallengeModal, OutgoingChallenge } from "./ui/ChallengeModal";
import { NavBar } from "./ui/NavBar";
import { SkillSprite } from "./ui/SkillArt";
import { Toasts } from "./ui/Toasts";

// Phaser is large; only load it once a game starts.
const Game = lazy(() => import("./screens/Game").then((m) => ({ default: m.Game })));

export function App() {
  const state = useAppState();
  const route = useRoute();

  useEffect(() => {
    store.connect();
    return () => store.disconnect();
  }, []);

  const reward = state.over?.reward ?? state.pendingReward;
  // Une partie en cours (ou son choix de compétences) prend la place de n'importe quelle page.
  const inGame = state.game !== null || state.deckSelect !== null;

  let screen;
  if (state.connection === "replaced") {
    screen = (
      <main className="page-center">
        <h1 className="page-title">Chessy</h1>
        <p className="muted">Ce compte est utilisé dans un autre onglet. Fermez celui-ci ou rechargez la page.</p>
      </main>
    );
  } else if (state.game) {
    screen = (
      <Suspense fallback={<p className="page-center muted">Chargement de la partie…</p>}>
        <Game view={state.game} />
      </Suspense>
    );
  } else if (state.deckSelect) {
    screen = <DeckSelect info={state.deckSelect} />;
  } else {
    switch (route.name) {
      case "auth":
        screen = <Auth />;
        break;
      case "ranking":
        screen = <Ranking />;
        break;
      case "friends":
        screen = <Friends />;
        break;
      case "profile":
        screen = <Profile username={route.param ?? ""} />;
        break;
      case "collection":
        screen = <Collection />;
        break;
      default:
        screen = <Lobby state={state} />;
    }
  }

  return (
    <>
      <SkillSprite />
      {state.connection === "closed" && (
        <div className="conn-banner" role="status">
          Connexion perdue, nouvelle tentative…
        </div>
      )}
      {!inGame && state.connection !== "replaced" && <NavBar state={state} route={route.name} />}
      {screen}
      {reward && <RewardModal offer={reward} />}
      {state.incomingChallenge && <ChallengeModal challenge={state.incomingChallenge} />}
      {state.outgoingChallenge && !inGame && <OutgoingChallenge username={state.outgoingChallenge} />}
      <Toasts toasts={state.toasts} />
    </>
  );
}
