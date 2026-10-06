# Chessy v3 — les 20 compétences restantes et le mode Solo

Complète `docs/spec-v2.md`. Les noms de champs JSON sont en `snake_case`. Le texte d'origine des
compétences est dans `docs/skills.md` (source de vérité quand ce document ne tranche pas).

## 1. Règles communes

- Une compétence s'utilise **une fois par partie** (Mind Reading : 3 fois) et **consomme le tour**,
  sauf Mind Reading et Mind Control (voir plus bas, `ends_turn = false`).
- Une compétence est refusée si, après elle, **le roi de l'utilisateur est en échec**. Les compétences marquées
  `forbids_mate` sont aussi refusées si elles mettent l'adversaire échec et mat ; `forbids_check`, si l'un des deux
  rois est en échec après elles.
- Toutes les durées sont en *plies* (actions), `expires_at = ply_de_lancement + n` (voir `Position::add_effect`).
  Un effet « actif » pendant `ply < expires_at`.
- Un pion ne peut jamais se retrouver sur la 1re ou la 8e rangée par une compétence, sauf Tornado (promotion en dame).
- **Mat avec compétences** : un camp n'est mat que s'il n'a aucune action qui le sauve. Les compétences qui ne
  consomment pas le tour (Mind Reading, Mind Control) ne comptent comme « sauvantes » que si, après les avoir jouées,
  il existe au moins un coup légal ; Mind Reading ne sauve jamais.
- Tout nouveau type respecte la pureté du moteur (aucune E/S, déterminisme : le « hasard » est une fonction du `ply` et
  de la position, jamais de `rand`).

## 2. Les 20 compétences

Cibles : `Piece{square}`, `Square{square}` (case vide), `Pair{a,b}`, `Spawn{square, kind}`, `None`.
Familles : A attaque, D défense, M mobilité, C contrôle, X création.

### Uniques
| Id | Fam. | Cible | Règle |
|---|---|---|---|
| `wall` | D | `None` | Ramène jusqu'à 3 pions du camp (autant que de pions capturés : `Position.captured_pawns[color]`, décrémenté) sur des cases vides, par priorité la 3e rangée du camp (6e pour les noirs) puis la 2e, colonnes les plus proches du roi d'abord. Chaque pion est `wall = true` (un pion mur qui meurt n'est pas compté dans `captured_pawns`) et reçoit un effet `locked` jusqu'au prochain tour du joueur (`expires_at = ply + 2`) : il ne peut pas bouger. Refusée s'il n'y a aucun pion capturé ou aucune case. |
| `mirage` | X | `Spawn{square, kind}` | `square` vide, `kind` ∈ {knight, bishop, rook, queen}. Crée une pièce `mirage = true` : elle **ne capture jamais** et **n'attaque pas** (ne donne pas échec, n'est pas comptée par `is_attacked`), et **disparaît** quand elle est prise (pas de cimetière). Dure jusqu'à capture. |
| `evolve` | X | `Piece{square}` | Une pièce alliée qui n'est ni roi ni dame devient une dame (même id). |
| `switch` | A | `Piece{square}` | Pièce adverse (pas le roi) qui n'attaque **aucune** pièce du joueur et ne donne pas échec ; elle change de camp définitivement (ses effets sont retirés). `forbids_mate`. |
| `mind` | X | `None` | Ne consomme pas le tour. 3 usages. Émet `Event::BestMove{from,to,promo?}` = meilleur coup du camp au trait calculé par `search::best_move(pos, 3)`. Ne change pas la position. |
| `control` | C | `Piece{square}` | Ne consomme pas le tour. Pièce adverse (pas le roi) : elle **change de couleur jusqu'à la fin du tour du joueur** (effet `color_loan` avec `orig_color`, `expires_at = ply + 1`), le joueur peut donc la déplacer comme la sienne ; elle reprend sa couleur ensuite. |

### Classiques
| Id | Fam. | Cible | Règle |
|---|---|---|---|
| `morph` | C | `Spawn{square, kind}` | `square` porte une pièce non-roi ; `kind` ∈ {pawn, knight, bishop, rook, queen} différent du type actuel (pas pion si la pièce est sur une rangée de fond). La pièce change de type : effet `morphed` avec `orig_kind`, `expires_at = ply + 2` si ennemie, `ply + 4` si alliée ; le type d'origine est rétabli à l'expiration. |
| `canceller` | C | `None` | Utilisable seulement si la **dernière action de l'adversaire était une compétence**. Restaure la position d'avant cette compétence (`Position.last_skill_snapshot`, voir §3) en décalant les expirations d'effets ; la compétence adverse reste consommée ; le tour passe. Événement `Event::Cancelled{skill}`. |
| `tornado` | M | `None` | Toutes les pièces sauf les rois tournent : on trie les pièces non-rois par angle autour du centre (puis par case) et chacune prend la case de la suivante (cycle). Un pion qui atterrit sur une rangée de fond est promu en dame. Événement `Event::Rotated{moves}`. |
| `invisibility` | D | `Piece{square}` | Pièce alliée non-roi : effet `invisible`, `expires_at = ply + 4`. Le serveur la cache à l'adversaire. |
| `terminator` | A | `Piece{square}` | Pièce adverse non-roi dont la case miroir (même colonne, rangée `7 − r`) est vide : une copie (`temp = true`, couleur du joueur, même type) apparaît sur la case miroir, effet `vanish` `expires_at = ply + 3` (la copie sert pendant le prochain tour du joueur puis disparaît). |
| `destiny_swapper` | M | `Pair{a,b}` | (déjà fait) |
| `trap` | C | `Square{square}` | Case vide : pose un piège `{square, owner}` (≤ 2 par joueur). Quand une pièce **adverse** parcourt une case piégée (tout le trajet d'un coup de glisseur, ou la case d'arrivée), elle **s'arrête sur la case piégée** (le coup est tronqué, pas de capture au-delà), reçoit `frozen` 2 tours (`expires_at = ply + 4`) et le piège est consommé. Les pièces ne peuvent pas être posées sur une case piégée par une compétence. Piège caché à l'adversaire. |
| `bench` | D | `Piece{square}` | Pièce alliée non-roi retirée de l'échiquier ; elle revient à `ply + 2` sur la case libre la plus proche de son ancienne case (distance de roi, puis ordre des cases), hors terrain bloqué. Stockée dans `Position.benched`. |
| `forcefield` | D | `Piece{square}` | Pièce alliée non-roi : effet `forcefield` sans expiration. Quand elle est capturée, elle va au cimetière et le capteur est **repoussé** de 2 cases au plus dans la direction d'où il vient (s'arrête devant un obstacle ou le bord). `Event::Pushed{piece, from, to}`. |
| `transposition` | M | `Pair{a,b}` | Deux pièces quelconques (n'importe quel camp) échangent leur case. `forbids_check` (aucun roi en échec après). |
| `queensac` | A | `None` | Utilisable quand le roi du joueur **est en échec** et qu'il a une dame : dame et roi échangent leur case, puis la dame **meurt** sur l'ancienne case du roi (comptée comme capturée) ; le roi doit être en sécurité à l'arrivée. |
| `temporal` | M | `Piece{square}` | Pièce alliée non-roi ayant un `prev` : elle **rejoue son dernier déplacement** (même vecteur `sq − prev`) depuis sa case actuelle si la case d'arrivée est dans l'échiquier et vide ou occupée par une pièce adverse non-roi non immune (capture). Remplace le coup du tour. |
| `geomancy` | X | `Square{square}` | Case vide `s` : `s` et ses voisines de même rangée qui sont vides deviennent des **terrains** (effet `terrain` avec `square`, `owner` = joueur, `expires_at = ply + 6`). Les pièces **adverses** ne peuvent ni s'y arrêter ni les traverser (les cavaliers sautent mais ne s'y posent pas). |
| `celestial` | D | `Piece{square}` | Pièce alliée non-roi : effet `celestial` (une fois). Si elle est capturée : le capteur occupe bien la case, mais la pièce est **replacée sur sa case de départ** (`home`, ou la plus proche libre) et l'effet est consommé. `Event::Saved{piece, from, to}`. |
| `godhelp` | X | `None` | Une pièce (`temp = true`) du joueur apparaît sur une case vide choisie de façon déterministe parmi les rangées 3 à 6 (index 2..=5), de type knight/bishop/rook/queen déterministe ; effet `vanish` `expires_at = ply + 7`. |

## 3. Modèle de données du moteur

- `Piece` gagne `home: Square`, `mirage: bool`, `wall: bool`, `temp: bool` (les trois booléens sont sérialisés seulement s'ils sont vrais ; `#[serde(default)]`).
- `EffectKind` gagne : `invisible`, `forcefield`, `celestial`, `locked`, `morphed`, `color_loan`, `vanish`, `terrain`.
  `ActiveEffect` gagne `#[serde(skip_serializing_if = "Option::is_none")]` `square`, `owner` (terrain), `orig_kind`, `orig_color` (morph / color_loan).
- `Position` gagne : `traps: Vec<Trap{square, owner}>`, `benched: Vec<BenchedPiece{piece, square, back_at}>`,
  `captured_pawns: [u8; 2]`, `last_skill_snapshot: Option<Box<Snapshot>>` (clone de `Position` sans snapshot, pris juste avant une compétence, effacé à toute autre action).
- `SkillTarget` gagne `Square{square}` et `Spawn{square, kind}`.
- `Skill` gagne `ends_turn() -> bool` (défaut `true`), `forbids_check() -> bool`, `max_uses() -> u8` (défaut 1) ; `SkillSlot` gagne `uses: u8` (`used` reste vrai quand `uses >= max_uses`).
- Nouveaux événements (`type` snake_case) : `spawned{square, piece}`, `transformed{square, kind}`, `switched{square, piece}`, `rotated{moves:[{from,to}]}`,
  `trap_set{square}`, `trap_sprung{square, piece}`, `benched{square, piece}`, `unbenched{square, piece}`, `pushed{piece, from, to}`,
  `saved{piece, from, to}`, `best_move{from, to, promo?}`, `cancelled{skill}`, `terrain{squares}`, `vanished{square, piece}`, `loan_ended{square, piece}`.
- Le comportement des anciennes compétences ne change pas ; les perft restent identiques (aucune compétence active).
- `search.rs` (déjà présent) : `best_move`, `score_moves`, `evaluate`. Le moteur reste sans dépendance à `rand`.

## 4. Serveur : informations cachées et vues

- `state.board` (vue de l'adversaire) : les pièces `invisible` du joueur adverse sont `null`. Le propriétaire les voit et ses `effects` incluent leurs effets ; la vue adverse retire les effets `invisible`.
- Nouveaux champs de `state` : `traps: Square[]` (uniquement les pièges **du joueur qui regarde**), `benched: Piece[]` (les siennes), `terrain: {square, owner, expires_at}[]`,
  `skill_options` inclut déjà les cibles ; `mind_uses_left` n'est pas nécessaire (`my_skills[].uses` suffit : ajoute `uses` et `max_uses` à `SkillSlot` dans la vue).
- Les événements qui révèlent une information cachée (apparition d'une case piégée, pièce invisible qui bouge) sont filtrés pour l'adversaire : un coup d'une pièce invisible produit pour l'adversaire un événement sans `piece`/`from` (il voit seulement l'arrivée si la case est visible).
  Simplification acceptée : l'adversaire voit « un coup a été joué » via le changement de `ply`.
- `Welcome`/`catalog` : aucune autre modification.

## 5. Mode Solo (IA)

### Protocole
- Client → serveur : `solo_start {elo: int (400..=2800), color: "white"|"black"|"random"}`. Autorisé aux invités et aux comptes. Refusé si le joueur est déjà en partie (`already_in_game`).
- Le flux est ensuite le même qu'un duel : `deck_select` (le bot a déjà choisi : 3 compétences classiques jouables au hasard + aucune unique), puis `state`, `game_over`.
  `OpponentInfo` gagne `bot: bool` (`username` = `"Sage"`, `elo` = niveau choisi, `guest = true`, `bot = true`). Les parties solo sont **amicales** (`rated=false`), **sans horloge** (`state.clock_enabled = false`, `clock.running = null`), **sans récompense** de compétence.
- Revanche contre le bot : `rematch_request` est accepté automatiquement (nouveau `solo` avec les mêmes réglages, couleurs inversées). Offre de nulle : le bot accepte seulement si l'évaluation est entre −30 et +30 centipions et que `ply_count ≥ 40`, sinon `draw_declined`. Le chat est ignoré.
- Le bot joue avec un délai de 600–1400 ms (plus long si la recherche a pris du temps) ; la recherche tourne dans `tokio::task::spawn_blocking` (le `Hub` ne bloque jamais). Si la partie a changé entre-temps (`ply` différent), le résultat est jeté. Le bot abandonne jamais ; il se retire si le joueur est déconnecté plus de 60 s (comme un duel).

### Niveaux
Le niveau `elo` règle : profondeur de recherche, bruit d'évaluation, probabilité de coup raté et d'usage des compétences.

| Elo | Profondeur | Comportement |
|---|---|---|
| 400–799 | 1 | choisit parmi les 5 meilleurs coups avec forte dispersion, 25–10 % de coups quasi aléatoires |
| 800–1199 | 2 | dispersion moyenne, 10–4 % de coups ratés |
| 1200–1599 | 3 | faible dispersion, 3–1 % |
| 1600–1999 | 4 | quasi déterministe |
| 2000–2399 | 5 | déterministe, budget ≈ 1,5 s |
| 2400–2800 | 6 | déterministe, budget ≈ 3 s, évaluation complète |

Interpoler linéairement à l'intérieur d'une tranche. L'IA est **déterministe à graine donnée** (graine = id de partie + ply) pour pouvoir tester.
Usage des compétences : à chaque tour l'IA évalue chaque action `Skill` légale (résultat simulé, évalué après un coup de réponse adverse peu profond) et la joue si elle améliore l'évaluation d'au moins `T` centipions
(`T` décroît avec l'Elo : 250 à 400, 60 à 2800), avec une probabilité d'usage croissante avec l'Elo ; elle ne joue jamais Mind Reading/Mind Control (inutiles pour elle).

## 6. Client

- `catalog.ts` : les 20 compétences passent `implemented: true` une fois le serveur prêt.
- Ciblage : `Square` (clic sur case vide), `Spawn` (clic sur la case puis choix du type dans une petite fenêtre, comme la promotion), `None` (lancement immédiat), `Pair` (déjà géré).
  Mind Reading/Mind Control ne passent pas la main : l'interface reste active ; `best_move` s'affiche en flèche sur le plateau jusqu'au prochain coup.
- Rendu des états : pièces `mirage` translucides, `wall` en pierre, `temp` avec liseré pointillé, `invisible` (pour son propriétaire) fantôme, effets `forcefield`/`celestial`/`locked`/`morphed`/`color_loan`, pièges (propriétaire seulement), terrains, banc (pièces mises de côté), animations des nouveaux événements.
- Solo : carte « Jouer contre l'IA » dans le lobby avec curseur d'Elo (400–2800, pas de 50), paliers nommés (Débutant, Amateur, Club, Expert, Maître, Grand Maître), choix de la couleur, bouton Commencer ; plaque adversaire affiche « Sage · 1400 » ; pas d'horloge quand `clock_enabled` est faux ; pas de récompense ; revanche immédiate.
