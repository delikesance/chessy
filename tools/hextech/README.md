# Assets « hextech »

Les rendus du client (pièces 3D, damier d'obsidienne, cadre d'or, boutons forgés, cadres de rareté, trame de fond) sont
produits par programme, sans image source : `numpy` + `Pillow` seulement. Sortie : `web/src/assets/hextech/`.

```sh
python3 -m venv .venv && .venv/bin/pip install numpy pillow
.venv/bin/python tools/hextech/pieces.py      # 12 pièces (ivoire-or, saphir-turquoise), lancer de rayons SDF
.venv/bin/python tools/hextech/ui_board.py    # damier, cadre d'or, boutons or / acier / pourpre
.venv/bin/python tools/hextech/ui_tiles.py    # cadres de rareté (5) et glyphes lumineux
.venv/bin/python tools/hextech/bg.py          # trame hexagonale tuilable
```

- Une seule lumière, en haut à gauche (`LIGHT` dans `metal.py`, `L_KEY` dans `pieces.py`).
- Les `_*.png` générés à côté des `.webp` sont des aperçus sans perte ; ils ne sont pas versionnés.
- Couronne : « Crown5 » de Reicon (MIT). Cavalier de la mascotte : « chess-knight » de Skoll, game-icons.net (CC BY 3.0).
