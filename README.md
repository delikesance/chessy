# Chessy

Jeu d'échecs en ligne où chaque joueur utilise des **compétences** pour modifier les règles.
Les règles des compétences sont décrites dans [docs/skills.md](docs/skills.md).

## Fonctionnalités

- **Comptes** : inscription / connexion (mots de passe argon2id, sessions), mode invité, promotion d'un invité en compte
  sans perdre son deck.
- **Classement Elo** : parties classées (file d'attente appariée par Elo, plage qui s'élargit avec l'attente),
  classement général, profils publics avec courbe d'Elo et historique, paliers Novice → Maître.
- **Social** : amis avec présence en temps réel, demandes, défis amicaux, recherche de joueurs.
- **En partie** : horloges serveur (10 min + 3 s par action), proposition de nulle, chat avec phrases rapides,
  revanche, abandon, reprise de partie après déconnexion (60 s de grâce).
- **Compétences** : les 27 sont jouables et illustrées (7 uniques, 20 classiques) ; règles dans [docs/skills.md](docs/skills.md) et [docs/spec-v3.md](docs/spec-v3.md).
- **Mode Solo** : partie d'entraînement contre l'IA « Sage », niveau d'Elo réglable de 400 à 2800 (profondeur, erreurs et usage des compétences varient avec le niveau), avec ou sans compte, sans horloge ni Elo en jeu.
- **Sons et couleurs** : une cinquantaine de sons synthétisés (Web Audio, aucun fichier) pour les coups, captures, compétences, « à vous de jouer », fin de partie, etc. ; page Réglages (volumes, thèmes de plateau, jeux de pièces, couleur d'accent).
- **Jouer à la souris** : glisser-déposer des pièces et **premoves** multiples (jusqu'à 10 coups empilés à l'avance, annulables d'un clic droit, Échap ou Retour arrière) comme sur chess.com.
- **Parties en direct** : onglet « En direct » pour regarder les parties en cours (contre l'IA ou entre joueurs, avec 30 s de décalage pour les duels) ; informations cachées (pièces invisibles, pièges) jamais révélées.
- **Replays et analyse** : toutes les parties sont enregistrées (« Mes parties ») ; replay pas à pas, analyse du moteur (précision, étiquettes meilleur/erreur/gaffe, meilleur coup en flèche) et exploration de variantes ; spécification dans [docs/spec-v4.md](docs/spec-v4.md).
- **Design B « Graphite »** : thème plat et sobre, plateau Phaser, carte de lancement des compétences.

Le contrat serveur/client est décrit dans [docs/spec-v2.md](docs/spec-v2.md).

## Structure

- `crates/chessy-engine` — moteur de règles (échecs standard + compétences), sans I/O
- `crates/chessy-server` — serveur WebSocket autoritatif (axum/tokio) + SQLite
- `web/` — client Vite + TypeScript (Phaser pour le plateau, React pour l'interface)

Le serveur est la seule source de vérité : le client reçoit l'état complet et la liste des
actions légales, et n'exécute aucune règle.

## Lancer en développement

Deux terminaux :

```bash
make dev-server   # serveur sur :3000 (base SQLite : ./chessy.sqlite)
make dev-web      # Vite sur :5173, proxy /ws vers le serveur
```

Ouvrez <http://localhost:5173>. Pour jouer contre vous-même, utilisez deux origines
différentes (le jeton d'identité est dans le `localStorage`), par exemple
`http://localhost:5173` et `http://[::1]:5173`.

Pour jouer seul, ouvrez deux navigateurs (ou profils) : le jeton de session est dans le `localStorage`.
Les routes de l'API REST (`/api/...`) et la WebSocket (`/ws`) sont proxifiées par Vite vers le serveur.

Variables d'environnement du serveur : `CHESSY_ADDR` (défaut `127.0.0.1:3000`),
`CHESSY_DB` (défaut `chessy.sqlite`), `CHESSY_WEB_DIR` (défaut `web/dist`, servi s'il existe).

## Tests

```bash
make check                                   # fmt, clippy, tests Rust, build + tests du client
cargo test --release -p chessy-engine -- --ignored   # perft profond (4,8 M de nœuds)
```

## Règles de jeu retenues pour le MVP

Le cahier des charges ne tranche pas tout ; voici les choix faits (faciles à changer dans le moteur) :

- Chaque compétence est utilisable **une fois par partie** (Mind Reading : 3 fois) et **consomme le tour**, sauf
  Mind Reading et Mind Control, après lesquelles on joue encore.
- Un camp n'est **mat** que s'il ne peut ni jouer un coup légal ni utiliser une compétence
  (une compétence peut donc sauver d'un mat).
- Les compétences ne ciblent pas les rois (sauf Transposition et Destiny Swapper). Une pièce gelée ne donne pas échec.
- Un nouveau joueur reçoit 3 compétences classiques au hasard ; un joueur qui n'en a plus reçoit
  une compétence classique au hasard.
- Récompense « aléatoire » : le gagnant reçoit une compétence tirée au hasard dans le pool global
  (classiques qu'il n'a pas + uniques sans propriétaire) et le perdant en perd une au hasard.
- Une compétence unique n'a qu'un seul propriétaire dans le monde (contrainte en base).
