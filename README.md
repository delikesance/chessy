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
- **Compétences** : 27 illustrées dans la collection ; 7 jouables pour l'instant (voir ci-dessous).
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

- Chaque compétence est utilisable **une fois par partie**, et l'utiliser **consomme le tour**.
- Un camp n'est **mat** que s'il ne peut ni jouer un coup légal ni utiliser une compétence
  (une compétence peut donc sauver d'un mat).
- Imune, Freeze, Rollback et Clone ne ciblent pas les rois. Une pièce gelée ne donne pas échec.
- Un nouveau joueur reçoit 3 compétences classiques au hasard ; un joueur qui n'en a plus reçoit
  une compétence classique au hasard.
- Récompense « aléatoire » : le gagnant reçoit une compétence tirée au hasard dans le pool global
  (classiques qu'il n'a pas + uniques sans propriétaire) et le perdant en perd une au hasard.
- Une compétence unique n'a qu'un seul propriétaire dans le monde (contrainte en base).

## Compétences implémentées

Teleportation, Imune, Freeze, Rollback, Clone, Destiny Swapper et l'unique **Remover**.
Les autres compétences de [docs/skills.md](docs/skills.md) restent à faire : un fichier par
compétence dans `crates/chessy-engine/src/skills/`, plus une ligne dans `skill()`.
