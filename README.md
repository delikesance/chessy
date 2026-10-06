# Chessy

Jeu d'échecs en ligne où chaque joueur utilise des **compétences** pour modifier les règles.
Les règles des compétences sont décrites dans [docs/skills.md](docs/skills.md).

## Structure

- `crates/chessy-engine` — moteur de règles (échecs standard + compétences), sans I/O
- `crates/chessy-server` — serveur WebSocket autoritatif (axum/tokio) + SQLite
- `web/` — client Vite + TypeScript (Phaser pour le plateau, React pour l'interface)

## Développement

```bash
cargo test
```
