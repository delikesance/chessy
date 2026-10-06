# Chessy v4 — sons, couleurs, glisser-déposer, spectateurs, replays et analyse

Complète `docs/spec-v2.md` et `docs/spec-v3.md`. JSON en `snake_case`. Chaque agent ne touche qu'à son périmètre ;
quand deux agents modifient le même fichier partagé (`protocol.ts`, `store.ts`, `App.tsx`, `hub.rs`, `protocol.rs`,
`store.rs`, `api.rs`), les modifications sont **additives et ciblées** (jamais de réécriture complète d'un fichier existant).

## 1. Enregistrement des parties (serveur)

- Toute partie terminée est enregistrée, **y compris les parties Solo** (jusqu'ici non enregistrées) : `games` gagne
  `kind` (`duel` | `challenge` | `room` | `solo`), `loadouts` (JSON : `{white:[skill_id…], black:[…]}`), `actions` (JSON : tableau des `Action`
  jouées dans l'ordre, y compris les compétences qui ne passent pas la main), `solo_elo`, `plies` (nombre d'actions).
  Le moteur étant déterministe, `loadouts + actions` suffisent à rejouer la partie (`Game::new` puis `Game::apply` en série).
- Les parties `solo` n'apparaissent **ni** dans `PublicProfile.recent` **ni** dans le classement ; elles apparaissent dans `GET /api/me/games`.
- Une partie annulée (deck non choisi, adversaire parti avant le premier coup) n'est pas enregistrée.

## 2. REST replays et analyse (agent S1)

Authentification optionnelle : `Authorization: Bearer <token>`. Les parties `solo` ne sont lisibles que par leur participant ; les autres sont publiques.

### `GET /api/me/games?limit=20&offset=0` (Bearer requis)
`{total, games: [GameSummary]}` du plus récent au plus ancien, `GameSummary = {game_id, kind, rated, white: Seat, black: Seat, color: "white"|"black" (le camp du demandeur), result: "win"|"loss"|"draw", reason, plies, elo_delta: int|null, at}`.
`Seat = {username: string|null, elo: int|null, bot: bool}` (`elo` = Elo avant la partie, ou niveau du bot).

### `GET /api/games/{id}`
`GameRecord = {game_id, kind, rated, white: Seat, black: Seat, result: {outcome: Outcome, reason}, plies, at, loadouts, moves: [MoveInfo], frames: [Frame]}` où :
- `MoveInfo = {ply (1-based : numéro de l'action), color, action: Action, notation: string}`. Notation : coups en français courant `Cf3`, `exd5`, `O-O`, `e8=D+` (pièces R, D, T, F, C ; `+` échec, `#` mat) ; compétences `Teleportation e2→e4`, `Freeze sur e5` (nom de compétence + cible lisible).
- `Frame = {ply (0 = position initiale), to_move, in_check, board: (Piece|null)[64], effects, traps: [{square, owner}], terrain: [{square, owner, expires_at}], benched: [{piece, square, owner, back_at}], events: Event[], used: {white:[skill_id], black:[…]}, outcome: Outcome}` — `board`/`effects` comme dans `state` mais **avec toute l'information** (pièces invisibles et pièges inclus : la partie est finie), `events` = ce qui s'est passé pour arriver à cette frame. `frames.length == plies + 1`.

### `GET /api/games/{id}/analysis?depth=3`
Calcule (puis met en cache par `(game_id, depth)` en base) l'analyse de toute la partie dans `spawn_blocking`, budget total ≤ 25 s (au-delà : profondeur réduite pour les coups restants). `depth` ∈ 1..=5 (défaut 3).
`{depth, plies: [PlyAnalysis], accuracy: {white: 0..100, black: 0..100}, summary: {white: Counts, black: Counts}}` avec
`PlyAnalysis = {ply, eval_cp: int (point de vue des blancs, borné à ±2000, mat = ±2000), best: {action: Action, notation: string, eval_cp: int}|null (meilleur coup *simple* du camp au trait avant l'action), loss_cp: int, label: "best"|"good"|"inaccuracy"|"mistake"|"blunder"}`.
Étiquettes sur la perte en centipions : `best` (coup = meilleur ou perte ≤ 10), `good` ≤ 50, `inaccuracy` ≤ 120, `mistake` ≤ 300, `blunder` > 300. Une compétence est évaluée par la position qu'elle produit (recherche à la profondeur demandée − 1) et comparée au meilleur coup simple. `Counts = {best, good, inaccuracy, mistake, blunder}`. `accuracy` = `100 · exp(−moyenne_des_pertes / 250)` arrondie.

### `POST /api/games/{id}/explore`
Corps `{ply: int, line: [Action], depth?: int (1..=5, défaut 3)}` : rejoue `ply` actions de la partie, puis la variation `line`.
Réponse `{valid: bool, error?: "illegal_action"|"bad_ply", at: int (nombre d'actions de `line` appliquées avec succès), frame: Frame|null, moves: [Move], skill_options: [{skill, targets: [SkillTarget]}], eval_cp: int, best: {action, notation, eval_cp}|null, notation: string[] (notation de chaque action de `line`)}` pour le camp au trait. Stateless : aucune session côté serveur. Limite : `line` ≤ 200 actions.

## 3. Spectateurs (agent S2)

- `GET /api/live?limit=50` → `{games: [LiveGame]}`, `LiveGame = {game_id, kind, rated, white: Seat, black: Seat, ply, started_at, spectators}` pour les parties **en cours** (phase de jeu, pas la sélection de deck), triées par Elo moyen décroissant puis ancienneté ; les parties `solo` y figurent (avec `kind: "solo"`).
- WebSocket client → serveur : `spectate {game_id}` / `unspectate {}`. Un joueur en partie ne peut pas regarder (`error already_in_game`) ; un spectateur qui lance une partie quitte automatiquement le mode spectateur. Maximum 50 spectateurs par partie (`error spectate_full`), partie introuvable `error no_such_game`.
- Serveur → client : `spectate_state {view: SpectatorView}` à l'entrée puis à chaque action, `spectate_over {view}` à la fin (puis le client est libéré), `spectate_ended {reason}` si la partie est annulée.
  `SpectatorView = {game_id, kind, rated, white: Seat, black: Seat, ply, to_move, in_check, board (pièces invisibles masquées), effects (sans invisible), terrain, clock: {white_ms, black_ms, running}, clock_enabled, events (pour animer), used: {white:[skill_id], black:[…]}, outcome, spectators: int, delay_ms}`. Les **pièges et pièces sur le banc des joueurs ne sont jamais révélés** aux spectateurs (champs absents).
- **Délai anti-triche** : les parties entre humains sont retransmises avec `delay_ms = 30000` (configurable : `HubConfig.spectator_delay`) ; les parties solo en direct (`0`). Les messages gardent leur ordre ; le `ply` d'une vue retardée peut être inférieur à celui de la partie.
- Les joueurs reçoivent `spectators: int` dans `state` (nombre de spectateurs courant) ; `FriendInfo` gagne `game_id: string|null` (partie en cours de l'ami, pour « Regarder »).
- Les spectateurs ne peuvent ni jouer, ni chatter. Ils sont décomptés à la déconnexion.

## 4. Client — sons, couleurs, glisser-déposer (agent C1)

### API sonore (fichier `web/src/sound/index.ts`, stub fourni, à implémenter)
`import { sfx } from "../sound"` : `sfx.play(name: SfxName, opts?: {volume?: number})`, `sfx.playEvents(events: GameEvent[], ctx: {me: Color; actor?: Color})` (fait jouer les sons des événements d'une action : coup/capture/échec/roque/promotion/compétence…), `sfx.setSettings`, `sfx.getSettings`, `sfx.subscribe`. Les sons sont **synthétisés avec Web Audio** (aucun fichier audio, aucune dépendance) ; l'`AudioContext` est repris au premier geste utilisateur ; tout appel avant est ignoré sans erreur ; en l'absence d'`AudioContext` (tests/SSR) tout est no-op.
`SfxName` : `move`, `capture`, `check`, `castle`, `promote`, `illegal`, `your_turn`, `game_start`, `game_win`, `game_lose`, `game_draw`, `low_time`, `match_found`, `chat`, `friend_request`, `challenge`, `notice`, `ui_click`, `trap_sprung`, `shield`, `pushed`, `saved`, `vanish`, et `skill_<id>` pour les 27 compétences (`skill_teleportation`, `skill_imune`, … ; chaque compétence a un timbre propre, famille = base commune : attaque agressif/percussif, défense résonant/grave, mobilité balayage/souffle, contrôle cristallin/dissonant, création montant/scintillant).
Réglages (persistés dans `localStorage`, clé `chessy.sound`) : `{enabled: bool, master: 0..1, effects: 0..1, ui: bool, yourTurn: bool}`.

### Couleurs
Page `#/settings` (route `settings`, lien dans le menu utilisateur) : thème de plateau, jeu de pièces, couleur d'accent, sons, mode de déplacement. Persisté dans `localStorage` (`chessy.theme`), appliqué partout via variables CSS (`--accent`, `--board-light`, `--board-dark`, …) et lu par Phaser.
Thèmes de plateau (id : clair / foncé) : `graphite` #cdd1d9/#69727f (défaut actuel), `emerald` #eeeed2/#769656, `walnut` #f0d9b5/#b58863, `ocean` #dce6f2/#5b7fa6, `amethyst` #e3d8f1/#8467b3, `coral` #fbe3d4/#d9805f.
Jeux de pièces : `classic` (ivoire/ébène actuel), `neon` (cyan #5ce1e6 / magenta #ff5fc8), `gold` (or #f2c94c / argent #aab4c3), `ember` (rouge #ff6b5a / azur #5aa9ff).
Accents : `blue` #8fb4ff (défaut), `violet` #b79cff, `coral` #ee8272, `amber` #eec06a, `mint` #5fd0a0, `rose` #f08fc0. Davantage de couleur dans l'interface : l'accent teinte le dernier coup, le camp au trait, les boutons au survol, l'onglet actif, les liserés ; le vert/rouge d'Elo (gain/perte) devient lisible (gain `--fam-defense`, perte `--danger`) ; les cartes de compétence prennent plus nettement la teinte de leur famille.

### Glisser-déposer
Sur le plateau Phaser : appui sur une pièce jouable → elle suit le pointeur (seuil de 4 px pour distinguer d'un clic, ombre/élévation, cases légales surlignées), relâchement sur une case légale = coup (sélecteur de promotion si besoin), ailleurs = retour à sa case. Le clic-clic reste possible. Glisser fonctionne aussi pour viser une compétence en deux étapes (`piece_to`, `pair`) : glisser la première pièce vers la case cible. Désactivable dans les réglages (« mode de déplacement » : glisser-déposer + clic / clic seulement). Support tactile (pointer events). Aucun effet quand le plateau est en lecture seule (`interactive={false}` sur `PhaserBoard`, nouvelle prop).

## 5. Client — spectateur, direct, replay, analyse (agent C2)

Routes : `#/live` (liste), `#/watch/<game_id>` (spectateur), `#/games` (Mes parties), `#/replay/<game_id>` (replay + analyse + exploration).
- **Direct** : liste rafraîchie toutes les 5 s (`GET /api/live`), cartes avec joueurs/Elo, tag Solo/Classée/Amicale, nombre de coups et de spectateurs, bouton « Regarder ». Entrée « En direct » dans la barre de navigation. Dans Amis : bouton « Regarder » quand un ami est `in_game` avec `game_id`.
- **Spectateur** : plateau en lecture seule, plaques des joueurs avec horloges (si `clock_enabled`), compétences utilisées, liste des coups, compteur de spectateurs, indication du délai (« Retransmission différée de 30 s »), animations et sons des événements, bouton Quitter ; à la fin, résultat et lien « Voir le replay ». Le store gère `spectate`/`unspectate` et les messages `spectate_*`.
- **Mes parties** : liste paginée (`GET /api/me/games`), filtre Toutes/Classées/Amicales/Solo, résultat coloré (victoire/défaite/nulle), Elo delta, liens Revoir / Analyser. Lien « Mes parties » dans le menu utilisateur. Dans les profils publics, les dernières parties ont un lien « Revoir ».
- **Replay** (`GET /api/games/{id}`) : plateau en lecture seule rejoué frame par frame, liste de coups cliquable (notation, étiquette colorée si analysée), contrôles début / précédent / lecture automatique (vitesses 0,5× 1× 2×) / suivant / fin, raccourcis clavier (← → Home End Espace), animations et **sons** à chaque pas, barre de progression, plaques des joueurs, résultat, orientation retournable.
- **Analyse** (`GET /api/games/{id}/analysis`) : bouton « Analyser » (profondeur 2–4 au choix) avec état de chargement, courbe d'évaluation cliquable sous le plateau, étiquettes par coup (meilleur, bon, imprécision, erreur, gaffe) avec couleurs distinctes (non vertes pour « bon » : bleu/gris ; gaffe = rouge), précision de chaque joueur, « Meilleur coup » affiché en flèche sur le plateau et dans un panneau (« Vous avez joué Fg5 ; le meilleur coup était Cf3 (+0,8) »), résumé (nombre de gaffes, etc.).
- **Exploration** (`POST /api/games/{id}/explore`) : bouton « Explorer à partir d'ici » ; le plateau devient jouable (coups et compétences via `moves`/`skill_options`, glisser-déposer si disponible), variation affichée sous la partie principale, annuler le dernier coup, retour à la partie ; évaluation et meilleur coup du moteur pour chaque position explorée ; toujours stateless (renvoie `line` complète à chaque coup).
- Depuis l'écran de fin de partie : boutons « Revoir la partie » et « Analyser » (le `game_id` y est déjà connu).
- Le plateau est réutilisé via `PhaserBoard` avec la nouvelle prop `interactive`. C2 n'édite pas `BoardScene.ts` (sauf si C1 a déjà fusionné et que c'est indispensable : dans ce cas modifications minimales et documentées).

## Notes d'implémentation — spectateurs

Précisions et écarts par rapport au §3, tels que livrés dans `crates/chessy-server/src/hub/spectate.rs` et `api_live.rs`.

### REST
- `GET /api/live?limit=50` : `limit` entre 1 et 100 (valeur hors bornes ramenée dans l'intervalle, valeur non numérique : `400 {"error":"bad_request"}`). Pas d'authentification. `Seat = {username, elo, bot}` (`bot` toujours présent). `started_at` : ISO 8601 UTC avec `Z`. Tri : somme des Elo décroissante (un invité compte pour 1200), puis ancienneté. `ply` est le `ply` **réel** de la partie (pas celui de l'image retardée). Les parties dont la fin n'a pas encore été retransmise n'y figurent plus ; une partie encore au choix des compétences n'y figure pas.
- `kind` vaut `duel` (file classée ou amicale), `room` (salle privée), `challenge` (défi d'ami) ou `solo`. Une revanche garde le `kind` de la partie d'origine.

### WebSocket
- `spectate {game_id}` : erreurs `already_in_game` (le joueur est dans une partie, y compris au choix des compétences), `no_such_game` (inconnue, au choix des compétences, ou déjà terminée même si sa fin n'est pas encore retransmise), `spectate_full` (50). Redemander la partie déjà suivie renvoie simplement l'image courante. Demander une autre partie quitte la précédente. `unspectate {}` ne répond rien et est sans effet si l'on ne regarde rien.
- Le spectateur reçoit d'abord un `spectate_state` correspondant à la **dernière vue déjà livrée** (donc retardée), `events` vide, horloge rattrapée du temps écoulé depuis sa livraison. Puis un `spectate_state` par action (y compris Mind Reading / Control : `ply` et `to_move` ne changent pas), et à la fin un `spectate_over` (l'outcome est dans la vue ; fin par mat, abandon, temps, nulle acceptée, déconnexion), après quoi le spectateur est libéré (il peut regarder une autre partie).
- **Compteur** : quand le nombre de spectateurs change, les joueurs reçoivent un `state` complet (`events` vide, champ `spectators`), et les autres spectateurs un `spectate_state` (dernière vue livrée, `events` vide, `spectators` à jour). Le client doit donc tolérer des `spectate_state` répétés avec le même `ply` et sans événement. Le nouvel arrivant n'est pas notifié deux fois. `StateView.spectators` est toujours présent (0 par défaut).
- Un spectateur qui lance une file (`queue_join`), crée une salle, démarre un solo ou voit un défi / une revanche aboutir quitte la partie regardée **sans message** (le client le sait déjà). Une déconnexion le désinscrit ; une reconnexion avec le même jeton (nouvelle socket qui remplace l'ancienne) renvoie l'image courante.
- Un spectateur ne peut ni jouer ni discuter : ses `action`, `chat`, `resign`, `offer_draw` reçoivent `not_in_game`.
- `spectate_ended {reason}` : envoyé si la partie suivie est annulée (`cancel_session`). Dans l'état actuel du serveur une partie qui a démarré n'est jamais annulée (déconnexion = forfait avec `game_over`, donc `spectate_over`) ; ce message est prévu pour le jour où les parties sans coup seront annulées (§1). Tout code qui annule une partie en cours doit passer par `cancel_session`.

### Délai
- `HubConfig.spectator_delay` : 30 s par défaut, appliqué aux parties entre humains ; les parties solo sont toujours retransmises sans délai (`delay_ms: 0`). La première vue (position initiale) est livrée tout de suite, sans délai (rien à cacher). Chaque vue est mise en file avec son heure d'échéance (`Timer::SpectatorFlush{game_id}`, un par vue) ; l'ordre est préservé, la fin de partie passe par la même file. L'horloge d'une vue retardée est celle du moment de l'action (le client l'interpole à la réception, ce qui correspond bien à la chronologie retardée). `delay_ms` est le délai configuré de la partie.
- Après la fin de la partie, la partie n'est plus regardable (`no_such_game`) bien que les spectateurs déjà présents reçoivent encore l'historique retardé.

### Vues et informations cachées
- `SpectatorView` ne contient aucun des champs propres à un joueur (`moves`, `skill_options`, `my_skills`, `traps`, `benched`). `board` et `effects` masquent les pièces invisibles **des deux camps** (et les effets qui leur sont attachés) ; `terrain` est public ; `used` donne les compétences épuisées (`used`) des deux camps.
- `events` : le filtre existant de `view.rs` est appliqué deux fois (point de vue blanc puis point de vue noir) avec l'ensemble des pièces cachées : un coup d'une pièce invisible n'émet aucun `moved`, `skill_used` d'un `trap`/`invisibility` (ou visant une case cachée) passe à `target: {"kind":"none"}`, `trap_set`, `best_move`, `effect_added{invisible}` ne sont jamais envoyés. `trap_sprung` est public, comme pour un joueur. Comme pour un adversaire, un `benched` / `unbenched` reste visible (la pièce est connue), mais la liste du banc ne l'est jamais.

### Amis
- `FriendInfo.game_id` : id de la partie en cours de l'ami **seulement si elle est regardable** (phase de jeu, pas le choix des compétences), sinon `null` (toujours présent). Un push de présence est envoyé aux amis quand la partie passe du choix des compétences au jeu.

### Code partagé touché
`hub.rs` (champs `feeds`/`watching`, `Session.kind`, `GameKind` passé à `create_game_as` / `start_session` / `open_session`, `Rematch.kind` dans `social.rs`, `broadcast_state` devient `&mut self` et publie la vue spectateur, `Timer::SpectatorFlush`), `protocol.rs`, `hub/view.rs` (`spectator_hidden`, `spectator_events`), `app.rs` (deux bras de `handle`, `live_games`), `api.rs` (une route), `lib.rs`. `GameKind` est défini dans `hub/spectate.rs` : l'agent S1 peut le réutiliser pour `games.kind` (`Session::kind()` renvoie `Solo` pour une partie contre le bot).
