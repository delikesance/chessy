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

## Notes d'implémentation — replays

Précisions et écarts pour §1 et §2, tels que livrés dans `crates/` (fichiers : `store.rs` + `games_store.rs` pour la base, `replay.rs`, `analysis.rs`, `api_games.rs`, et côté moteur `notation.rs` et `analysis.rs`).

### Enregistrement
- Migration `user_version = 3` : `games` est reconstruite (`white`/`black` deviennent nullables : le siège du bot d'une partie solo vaut `NULL`) avec les colonnes `kind` (défaut `duel`), `loadouts`, `actions`, `solo_elo` ; la table `game_analysis(game_id, depth, result, created_at)` sert de cache. Les anciennes lignes gardent tout (Elo, raison, horodatages) mais n'ont ni `loadouts` ni `actions` : elles figurent dans `GET /api/me/games` et dans le profil, et `GET /api/games/{id}`, `/analysis` et `/explore` répondent `404 {error:"no_replay"}`. Leur `kind` est `duel` (l'origine exacte est inconnue).
- `loadouts` = `{"white":[skill_id…],"black":[…]}` dans l'ordre passé à `Game::new` (les trois choix puis les uniques du deck) ; `actions` = tableau JSON des `Action` appliquées, **Mind Reading / Mind Control compris** (ils ne passent pas la main, donc le numéro d'action `ply` d'un replay n'est pas `Position::ply`). `plies` = nombre d'actions ; le seuil « classée » (≥ 4) reste évalué sur `Position::ply`.
- `kind` : `duel` (file classée ou amicale), `room`, `challenge`, `solo` ; une revanche garde le `kind` de la partie d'origine. Toute partie qui arrive à `finish_game` est enregistrée (y compris un abandon/une déconnexion avant le premier coup : `plies = 0`, un replay réduit à la position initiale) ; une partie annulée (`game_cancelled`) ne l'est pas.
- Les colonnes `white_elo_before`/`black_elo_before` sont aussi remplies pour les parties non classées (Elo courant des **comptes**, `NULL` pour un invité) afin que `Seat.elo` soit disponible ; `*_elo_after` et donc `elo_delta` ne le sont que pour une partie classée. L'enregistrement et le règlement Elo restent dans la même transaction.
- `PublicProfile.recent`, `streak` et le classement ignorent le solo (`kind != 'solo'` dans la requête commune, les compteurs ne sont jamais touchés).

### REST : généralités
- Authentification optionnelle : un jeton absent **ou inconnu** vaut « anonyme » (jamais d'erreur) ; seul `GET /api/me/games` répond `401 {error:"unauthorized"}`. Une partie `solo` qu'on n'a pas le droit de lire répond `404 {error:"not_found"}`, comme une partie inconnue.
- Erreurs : `400 bad_request` (JSON ou paramètre invalide, `ply` absent, action inconnue), `400 invalid_depth` (profondeur hors 1..=5, aussi pour `explore`), `400 line_too_long` (`line` > 200), `413 payload_too_large` (corps d'`explore` > 64 Kio), `404 no_replay`, `500 replay_failed` (une action enregistrée est refusée par le moteur : ne devrait jamais arriver).
- `GET /api/me/games` : `limit` 20 par défaut, borné à 1..=100 ; `offset` 0 par défaut ; `total` compte toutes les parties du joueur (solo compris). `GameSummary.elo_delta` n'est non nul que pour une partie classée ; `Seat.username` est `null` pour un invité, le bot est `{username:"Sage", elo:<niveau>, bot:true}`. `reason` suit `game_over.reason`. `at` est la fin de partie, ISO 8601 UTC avec `Z`.

### `GET /api/games/{id}`
- Champs exactement comme au §2 ; `loadouts = {white:[…], black:[…]}`, `result = {outcome, reason}`, `plies` = nombre d'actions. `moves[i].ply = i + 1`, `moves[i].action` est l'action telle qu'enregistrée.
- `Frame` : `board` = les 64 cases avec **toutes** les pièces (invisibles comprises), `effects` **sans** les terrains (ils sont dans `terrain`), `traps` = `[{square, owner}]` (tous les pièges, des deux camps), `benched = [{piece, square, owner, back_at}]`, `events` = événements bruts de l'action (non filtrés), `used.{white,black}` = compétences utilisées **au moins une fois** (Mind Reading dès son premier usage, contrairement à `opponent_skills.used`), `in_check` pour le camp au trait. `outcome` de chaque frame est celui calculé par les règles (`ongoing` jusqu'à la fin) ; **la dernière frame (et `result.outcome`) porte l'issue réelle enregistrée** (abandon, temps écoulé, nulle acceptée…).
- La réponse est un JSON compact ; une partie de 120 actions pèse environ 200 Ko et se construit en ~25 ms.

### Notation
- `Cf3`, `exd5` (aussi la prise en passant), `O-O` / `O-O-O`, `e8=D+`, `exd8=T`, `Dh4#` ; lettres R, D, T, F, C ; désambiguïsation standard (colonne si elle suffit, sinon rangée, sinon les deux ; une pièce clouée n'est pas un rival). `+` si le roi au trait est en échec, `#` si la partie se termine par mat (règles complètes, compétences comprises). La case d'arrivée est celle où la pièce s'est vraiment arrêtée (un piège peut raccourcir un coup de glisseur) ; une promotion annulée par un piège n'a pas de `=X`.
- Compétences : `Teleportation e2→e4` (cible `piece_to`), `Freeze sur e5` (cible `piece` ou `square`), `Destiny Swapper b1↔g1` (cible `pair`), `Mirage sur f3 (Cavalier)` (cible `spawn` ; Pion, Cavalier, Fou, Tour, Dame), le nom seul pour une cible `none` (`Tornado`). Noms : ceux du catalogue client (`Trap Card`, `The Bench`, `Force Field`, `Switch Sides`, `Mind Reading`, `Mind Control`, `Queen Sacrifice`, `Temporal Distortion`, `Celestial Intervention`, `God Help`…).

### `GET /api/games/{id}/analysis?depth=3`
- `{depth, plies, accuracy, summary}` comme au §2, plus, **seulement si le budget de temps a forcé une profondeur moindre**, `reduced_from_ply` (premier coup analysé moins profondément). `depth` est toujours la profondeur demandée.
- `eval_cp` du coup `p` = évaluation (blancs, ±2000, mat = ±2000) de la position **après** l'action `p` (recherche à `depth` ; mat/pat/nulle de règles = ±2000 / 0 ; un abandon ou un temps écoulé n'est pas un mat). `best` = meilleur coup *simple* avant l'action (`best.eval_cp` du point de vue des blancs, `null` s'il n'y a aucun coup) ; `loss_cp` = `max(0, éval(best) − valeur de l'action)`, les deux bornées à ±2000 et vues du joueur qui agit. La valeur d'une action (coup ou compétence, y compris Mind Reading/Control) est la recherche de la position qu'elle produit à `max(depth − 1, 1)` ; l'action égale au meilleur coup a une perte nulle et l'étiquette `best`.
- `accuracy` = `100·exp(−moyenne des pertes / 250)` arrondie par camp (100 si le camp n'a agi aucune fois) ; `summary` compte les étiquettes de **toutes** les actions du camp.
- Moteur : `chessy_engine::search::search_with` (non modifié), profondeur fixe, sans table de répétition de la partie. Les positions sont indépendantes : l'analyse s'exécute dans `spawn_blocking` sur au plus 4 fils, et au plus 2 analyses/explorations tournent en même temps (les autres attendent, puis trouvent souvent le cache). Budget total 25 s : la profondeur baisse d'un cran dès que le temps déjà écoulé annonce un dépassement (80 % du budget pour les meilleurs coups, le reste pour la valeur des actions jouées) et une échéance dure interrompt toute recherche après sa première itération. Mesures : 120 actions à profondeur 3 en ≈ 3 à 5 s (16 cœurs, parties aléatoires pleines de compétences ; ≈ 10 s sur un seul fil).
- Cache `(game_id, depth)` en base, y compris pour un résultat à profondeur réduite ; la réponse mise en cache est renvoyée telle quelle. Deux demandes simultanées pour la même clé ne calculent qu'une fois (la seconde attend la première, puis relit le cache).

### `POST /api/games/{id}/explore`
- Corps `{ply, line, depth?}` ; `line` vaut `[]` par défaut. Stateless : la partie est rejouée à chaque appel.
- `ply` < 0 ou > nombre d'actions → **`200`** `{valid:false, error:"bad_ply", at:0, frame:null, moves:[], skill_options:[], eval_cp:0, best:null, notation:[]}`.
- Première action de `line` refusée → `valid:false`, `error:"illegal_action"`, `at` = nombre d'actions appliquées, et `frame`/`moves`/`skill_options`/`eval_cp`/`best` décrivent **la dernière position valide** (jouable par le client) ; `notation` ne contient que les actions appliquées. Après une partie finie (mat, nulle de règles), toute action est refusée.
- `frame.ply = ply + at`, `frame.events` = événements de la dernière action appliquée ; `frame.outcome` est l'issue des règles (pas l'abandon enregistré : on peut explorer à partir de la dernière position d'une partie abandonnée). `moves` / `skill_options` : toutes les actions légales du camp au trait (vides si la partie est finie). `eval_cp` et `best.eval_cp` sont du point de vue des blancs ; position finie : `eval_cp` = ±2000 (mat) ou 0, `best = null`. La recherche de `best` est limitée à 10 s.

### Tests
`crates/chessy-engine/tests/notation.rs` (notation, étiquettes, précision) et `crates/chessy-server/tests/replays.rs` : enregistrement (duel classé, amical, invités, salle, défi, revanche, solo, annulée), exclusion du solo du profil et du classement, pagination, migration d'une ancienne base (et nouvelles parties à côté des anciennes), replay fidèle d'une partie réelle avec compétences (comparaison image par image avec les `state` reçus par chaque joueur, déterminisme), étiquettes sur une gaffe évidente, mat à ±2000, cache et profondeur, réduction de profondeur au-delà du budget, exploration (valide, illégale, `bad_ply`, limites, position finie, compétences), contrôle d'accès, partie longue sous le budget.
