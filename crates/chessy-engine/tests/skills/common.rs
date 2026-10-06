//! Shared helpers for the skill tests.
#![allow(dead_code)]

pub use chessy_engine::*;

pub fn s(name: &str) -> Square {
    parse_square(name).unwrap_or_else(|| panic!("bad square {name}"))
}

pub fn name(sq: Square) -> String {
    square_name(sq)
}

/// A game from a FEN where white has `white` and black has `black` skills.
pub fn game(fen: &str, white: &[SkillId], black: &[SkillId]) -> Game {
    Game::from_position(Position::from_fen(fen).expect("valid fen"), white, black)
}

pub fn start(white: &[SkillId], black: &[SkillId]) -> Game {
    Game::new(white, black)
}

pub fn mv(g: &mut Game, from: &str, to: &str) -> Vec<Event> {
    g.apply(Action::Move {
        from: s(from),
        to: s(to),
        promo: None,
    })
    .unwrap_or_else(|e| panic!("{from}{to}: {e}"))
}

pub fn mv_promo(g: &mut Game, from: &str, to: &str, promo: PieceKind) -> Vec<Event> {
    g.apply(Action::Move {
        from: s(from),
        to: s(to),
        promo: Some(promo),
    })
    .unwrap_or_else(|e| panic!("{from}{to}: {e}"))
}

pub fn use_skill(g: &mut Game, id: SkillId, target: SkillTarget) -> Vec<Event> {
    g.apply(Action::Skill { skill: id, target })
        .unwrap_or_else(|e| panic!("{id:?} {target:?}: {e}"))
}

pub fn skill_fails(g: &mut Game, id: SkillId, target: SkillTarget) -> bool {
    g.apply(Action::Skill { skill: id, target }).is_err()
}

pub fn can_move(g: &Game, from: &str, to: &str) -> bool {
    g.legal_actions()
        .iter()
        .any(|a| matches!(a, Action::Move { from: f, to: t, .. } if *f == s(from) && *t == s(to)))
}

pub fn can_skill(g: &Game, id: SkillId, target: SkillTarget) -> bool {
    g.legal_actions()
        .iter()
        .any(|a| matches!(a, Action::Skill { skill, target: t } if *skill == id && *t == target))
}

/// Every legal target of `id` right now.
pub fn targets_of(g: &Game, id: SkillId) -> Vec<SkillTarget> {
    g.legal_actions()
        .into_iter()
        .filter_map(|a| match a {
            Action::Skill { skill, target } if skill == id => Some(target),
            _ => None,
        })
        .collect()
}

pub fn has_skill(g: &Game, id: SkillId) -> bool {
    !targets_of(g, id).is_empty()
}

pub fn moves_from(g: &Game, from: &str) -> Vec<String> {
    let mut out: Vec<String> = g
        .legal_actions()
        .iter()
        .filter_map(|a| match a {
            Action::Move { from: f, to, .. } if *f == s(from) => Some(name(*to)),
            _ => None,
        })
        .collect();
    out.sort();
    out.dedup();
    out
}

pub fn at(g: &Game, sqr: &str) -> Option<Piece> {
    g.pos.piece_at(s(sqr))
}

pub fn kind_at(g: &Game, sqr: &str) -> Option<(Color, PieceKind)> {
    at(g, sqr).map(|p| (p.color, p.kind))
}

pub fn effects_on(g: &Game, sqr: &str) -> Vec<EffectKind> {
    let Some(p) = at(g, sqr) else {
        return Vec::new();
    };
    g.pos
        .effects
        .iter()
        .filter(|e| e.piece == p.id)
        .map(|e| e.kind)
        .collect()
}

pub fn piece(sqr: &str) -> SkillTarget {
    SkillTarget::Piece { square: s(sqr) }
}

pub fn square(sqr: &str) -> SkillTarget {
    SkillTarget::Square { square: s(sqr) }
}

pub fn spawn(sqr: &str, kind: PieceKind) -> SkillTarget {
    SkillTarget::Spawn {
        square: s(sqr),
        kind,
    }
}

pub fn pair(a: &str, b: &str) -> SkillTarget {
    SkillTarget::Pair {
        a: s(a).min(s(b)),
        b: s(a).max(s(b)),
    }
}

pub fn piece_to(from: &str, to: &str) -> SkillTarget {
    SkillTarget::PieceTo {
        from: s(from),
        to: s(to),
    }
}

pub fn none() -> SkillTarget {
    SkillTarget::None
}

pub fn slot(g: &Game, color: Color, id: SkillId) -> SkillSlot {
    *g.loadout(color)
        .slots
        .iter()
        .find(|sl| sl.skill == id)
        .expect("skill in loadout")
}

/// Plays the first legal plain move (deterministic filler).
pub fn filler(g: &mut Game) {
    let m = g
        .legal_actions()
        .into_iter()
        .find(|a| matches!(a, Action::Move { .. }))
        .expect("a legal move");
    g.apply(m).expect("legal");
}

pub fn count_pieces(g: &Game, color: Color) -> usize {
    g.pos.pieces(color).count()
}

pub const KINGS: &str = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
