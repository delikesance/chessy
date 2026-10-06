use super::{Skill, SkillId, SkillTarget};
use crate::position::{offset, Position};
use crate::types::*;

/// An empty square and its empty neighbours on the same rank become terrain
/// for six actions: the opponent's pieces can neither stop on it nor cross it.
pub struct Geomancy;

fn is_terrain(pos: &Position, s: Square) -> bool {
    pos.effects
        .iter()
        .any(|e| e.kind == EffectKind::Terrain && e.square == Some(s))
}

/// Squares that would become terrain when aiming at `s`.
fn covered(pos: &Position, s: Square) -> Vec<Square> {
    [0i8, -1, 1]
        .into_iter()
        .filter_map(|df| offset(s, df, 0))
        .filter(|&t| pos.board[t as usize].is_none() && !is_terrain(pos, t))
        .collect()
}

impl Skill for Geomancy {
    fn id(&self) -> SkillId {
        SkillId::Geomancy
    }

    fn targets(&self, pos: &Position, _color: Color) -> Vec<SkillTarget> {
        (0..64u8)
            .filter(|&s| pos.board[s as usize].is_none() && !is_terrain(pos, s))
            .map(|square| SkillTarget::Square { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Square { square } = target else {
            return;
        };
        let squares = covered(pos, square);
        for &s in &squares {
            let mut terrain = ActiveEffect::new(EffectKind::Terrain, NO_PIECE, pos.ply + 6);
            terrain.square = Some(s);
            terrain.owner = Some(color);
            pos.effects.push(terrain);
        }
        ev.push(Event::Terrain { squares });
    }
}
