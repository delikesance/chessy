import { useEffect, useMemo, useState } from "react";
import type { FriendInfo, UserResult } from "../protocol";
import { hrefFor } from "../router";
import { store, useAppState } from "../store";
import { EloChart } from "../ui/EloChart";
import { RecentGames } from "../ui/RecentGames";
import { StatTile } from "../ui/StatTile";
import { initialOf, presenceLabel, RELATION_LABEL, sortFriends, winRate } from "../ui/social";
import { tierOf } from "../ui/tier";
import { useProfile } from "../ui/useProfile";
import "./friends.css";

export function Friends() {
  const { account, friends, connection } = useAppState();
  const guest = !account || account.guest;

  if (account && guest) {
    return (
      <main className="fr-page">
        <div className="card fr-guest">
          <p className="eyebrow">Amis</p>
          <h1>Les amis demandent un compte</h1>
          <p className="muted">
            Avec un compte, vous retrouvez vos amis, voyez qui est en ligne et pouvez les défier en un clic. Votre deck
            d'invité est conservé à l'inscription.
          </p>
          <a className="btn pri fr-guest-btn" href={hrefFor({ name: "auth" })}>
            Créer un compte ou se connecter
          </a>
        </div>
      </main>
    );
  }

  return <FriendsBody online={connection === "open"} friends={friends} />;
}

function FriendsBody({ online, friends }: { online: boolean; friends: ReturnType<typeof useAppState>["friends"] }) {
  const sorted = useMemo(() => sortFriends(friends.friends), [friends.friends]);
  const [selected, setSelected] = useState<string | null>(null);
  const current = sorted.find((f) => f.username === selected) ?? sorted[0] ?? null;

  return (
    <main className="fr-page">
      <header className="fr-head">
        <p className="eyebrow">Social</p>
        <h1 className="fr-title">Amis</h1>
      </header>
      <div className="fr-grid">
        <aside className="fr-side card" aria-label="Vos amis">
          <AddFriend online={online} />
          <Requests incoming={friends.incoming} outgoing={friends.outgoing} online={online} />
          <section className="fr-sec" aria-labelledby="fr-list-h">
            <h2 id="fr-list-h" className="fr-sec-h">
              Mes amis <span className="mono fr-count">{sorted.length}</span>
            </h2>
            {sorted.length === 0 ? (
              <p className="fr-empty muted">Pas encore d'amis. Cherchez un pseudo ci-dessus pour envoyer une demande.</p>
            ) : (
              <ul className="fr-list">
                {sorted.map((f) => (
                  <li key={f.username}>
                    <FriendRow friend={f} active={current?.username === f.username} onSelect={() => setSelected(f.username)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="fr-detail" aria-label="Profil de l'ami sélectionné">
          {current ? (
            <Detail key={current.username} friend={current} online={online} />
          ) : (
            <div className="card fr-placeholder">
              <p className="muted">Sélectionnez un ami pour voir ses statistiques et le défier.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// ---- recherche / ajout --------------------------------------------------------

function AddFriend({ online }: { online: boolean }) {
  const { userResults } = useAppState();
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Set<string>>(new Set());
  const q = query.trim();
  const active = q.length >= 2;

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => store.send({ type: "user_search", query: q }), 300);
    return () => clearTimeout(t);
  }, [q, active]);

  const fresh = active && userResults && userResults.query.trim().toLowerCase() === q.toLowerCase();
  const users = fresh ? userResults.users : null;

  function request(u: UserResult) {
    store.send({ type: "friend_request", username: u.username });
    setSent((s) => new Set(s).add(u.username));
  }
  function accept(u: UserResult) {
    store.send({ type: "friend_respond", username: u.username, accept: true });
  }

  return (
    <section className="fr-sec" aria-labelledby="fr-add-h">
      <h2 id="fr-add-h" className="fr-sec-h">
        Ajouter par pseudo
      </h2>
      <label className="fr-sr" htmlFor="fr-search">
        Pseudo à rechercher
      </label>
      <input
        id="fr-search"
        className="input fr-search"
        type="search"
        placeholder="Rechercher un pseudo…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={32}
        aria-describedby="fr-search-status"
      />
      <div id="fr-search-status" aria-live="polite" className="fr-search-status">
        {query && !active && <p className="fr-hint">Saisissez au moins 2 caractères.</p>}
        {active && !users && <p className="fr-hint">Recherche…</p>}
        {users && users.length === 0 && <p className="fr-hint">Aucun joueur ne commence par « {q} ».</p>}
      </div>
      {users && users.length > 0 && (
        <ul className="fr-results">
          {users.map((u) => {
            const relation = u.relation === "none" && sent.has(u.username) ? "outgoing" : u.relation;
            return (
              <li key={u.username} className="fr-result">
                <span className="avatar">{initialOf(u.username)}</span>
                <span className="fr-who">
                  <a className="fr-name" href={hrefFor({ name: "profile", param: u.username })}>
                    {u.username}
                  </a>
                  <span className="mono fr-elo">{u.elo}</span>
                </span>
                {relation === "none" ? (
                  <button type="button" className="btn sm" onClick={() => request(u)} disabled={!online}>
                    Ajouter
                  </button>
                ) : relation === "incoming" ? (
                  <button type="button" className="btn sm" onClick={() => accept(u)} disabled={!online}>
                    Accepter
                  </button>
                ) : (
                  <span className="tag">{RELATION_LABEL[relation]}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---- demandes ----------------------------------------------------------------

function Requests({
  incoming,
  outgoing,
  online,
}: {
  incoming: { username: string; elo: number }[];
  outgoing: { username: string }[];
  online: boolean;
}) {
  if (incoming.length === 0 && outgoing.length === 0) return null;
  return (
    <section className="fr-sec" aria-labelledby="fr-req-h">
      <h2 id="fr-req-h" className="fr-sec-h">
        Demandes <span className="mono fr-count">{incoming.length + outgoing.length}</span>
      </h2>
      <ul className="fr-list">
        {incoming.map((r) => (
          <li key={r.username} className="fr-req">
            <span className="avatar">{initialOf(r.username)}</span>
            <span className="fr-who">
              <a className="fr-name" href={hrefFor({ name: "profile", param: r.username })}>
                {r.username}
              </a>
              <span className="mono fr-elo">{r.elo}</span>
            </span>
            <span className="fr-req-btns">
              <button
                type="button"
                className="btn sm"
                onClick={() => store.send({ type: "friend_respond", username: r.username, accept: true })}
                disabled={!online}
                aria-label={`Accepter la demande de ${r.username}`}
              >
                Accepter
              </button>
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => store.send({ type: "friend_respond", username: r.username, accept: false })}
                disabled={!online}
                aria-label={`Refuser la demande de ${r.username}`}
              >
                Refuser
              </button>
            </span>
          </li>
        ))}
        {outgoing.map((r) => (
          <li key={r.username} className="fr-req">
            <span className="avatar">{initialOf(r.username)}</span>
            <span className="fr-who">
              <span className="fr-name">{r.username}</span>
            </span>
            <span className="tag">En attente</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- liste ---------------------------------------------------------------------

function FriendRow({ friend: f, active, onSelect }: { friend: FriendInfo; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`fr-row${active ? " on" : ""}`} onClick={onSelect} aria-pressed={active}>
      <span className="fr-av">
        <span className="avatar">{initialOf(f.username)}</span>
        <span className={`presence ${f.presence} fr-dot`} aria-hidden="true" />
      </span>
      <span className="fr-who">
        <span className="fr-name">{f.username}</span>
        <span className="fr-sub">{presenceLabel(f.presence, f.last_seen)}</span>
      </span>
      <span className="mono fr-elo">{f.elo}</span>
    </button>
  );
}

// ---- détail --------------------------------------------------------------------

function Detail({ friend, online }: { friend: FriendInfo; online: boolean }) {
  const { outgoingChallenge } = useAppState();
  const { state, reload } = useProfile(friend.username);
  const [confirming, setConfirming] = useState(false);

  const pending = outgoingChallenge !== null && outgoingChallenge.toLowerCase() === friend.username.toLowerCase();
  const otherPending = outgoingChallenge !== null && !pending;
  const canChallenge = online && friend.presence === "online" && !outgoingChallenge;
  const why =
    friend.presence === "in_game"
      ? `${friend.username} est en partie.`
      : friend.presence === "offline"
        ? `${friend.username} est hors ligne.`
        : otherPending
          ? "Un autre défi est déjà en attente."
          : "";

  return (
    <div className="card fr-card">
      <div className="fr-card-head">
        <span className="fr-av">
          <span className="avatar fr-avatar-lg">{initialOf(friend.username)}</span>
          <span className={`presence ${friend.presence} fr-dot`} aria-hidden="true" />
        </span>
        <div className="fr-card-id">
          <h2 className="fr-card-name">{friend.username}</h2>
          <p className="fr-sub">
            <span className="tag">{tierOf(friend.elo).name}</span> {presenceLabel(friend.presence, friend.last_seen)}
          </p>
        </div>
        <div className="fr-actions">
          {pending ? (
            <>
              <button type="button" className="btn pri" disabled>
                Défi envoyé
              </button>
              <button type="button" className="btn ghost" onClick={() => store.cancelChallenge()}>
                Annuler
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn pri" disabled={!canChallenge} onClick={() => store.send({ type: "challenge", username: friend.username })}>
                Défier
              </button>
              {friend.presence === "in_game" && friend.game_id && (
                <a className="btn" href={hrefFor({ name: "watch", param: friend.game_id })}>
                  Regarder
                </a>
              )}
            </>
          )}
        </div>
      </div>
      {why && !pending && <p className="fr-why muted">{why}</p>}

      {state.status === "loading" && <div className="fr-skel" aria-busy="true" aria-label="Chargement du profil" />}
      {state.status === "error" && (
        <div className="fr-err" role="alert">
          <p>{state.message}</p>
          <button type="button" className="btn sm" onClick={reload}>
            Réessayer
          </button>
        </div>
      )}
      {state.status === "notfound" && <p className="muted">Ce profil n'est plus disponible.</p>}
      {state.status === "ready" && (
        <>
          <div className="fr-stats">
            <StatTile label="Elo" value={state.profile.elo} />
            <StatTile label="Rang" value={state.profile.rank ? `#${state.profile.rank}` : "—"} />
            <StatTile
              label="V · N · D"
              value={`${state.profile.wins} · ${state.profile.draws} · ${state.profile.losses}`}
              hint={winRate(state.profile.wins, state.profile.games) === null ? "Aucune partie" : `${winRate(state.profile.wins, state.profile.games)} % de victoires`}
            />
          </div>
          <h3 className="fr-sub-h">Évolution de l'Elo</h3>
          <EloChart history={state.profile.history} />
          <h3 className="fr-sub-h">Dernières parties</h3>
          <RecentGames games={state.profile.recent} limit={5} />
          <a className="fr-full" href={hrefFor({ name: "profile", param: friend.username })}>
            Voir le profil complet
          </a>
        </>
      )}

      <div className="fr-remove">
        {confirming ? (
          <div className="fr-confirm" role="alertdialog" aria-label={`Retirer ${friend.username}`}>
            <span>Retirer {friend.username} de vos amis ?</span>
            <button
              type="button"
              className="btn sm danger"
              onClick={() => {
                store.send({ type: "friend_remove", username: friend.username });
                setConfirming(false);
              }}
              disabled={!online}
              autoFocus
            >
              Confirmer
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setConfirming(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className="btn sm ghost danger" onClick={() => setConfirming(true)} disabled={!online}>
            Retirer
          </button>
        )}
      </div>
    </div>
  );
}
