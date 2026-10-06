use super::{Skill, SkillId, SkillKind, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// Unique skill: summons a fake knight, bishop, rook or queen on an empty
/// square. It never captures, attacks nothing and vanishes when taken.
pub struct Mirage;

const KINDS: [PieceKind; 4] = [
    PieceKind::Knight,
    PieceKind::Bishop,
    PieceKind::Rook,
    PieceKind::Queen,
];

impl Skill for Mirage {
    fn id(&self) -> SkillId {
        SkillId::Mirage
    }

    fn kind(&self) -> SkillKind {
        SkillKind::Unique
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        let mut out = Vec::new();
        for square in 0..64u8 {
            if !pos.can_place(color, PieceKind::Knight, square) {
                continue;
            }
            for kind in KINDS {
                out.push(SkillTarget::Spawn { square, kind });
            }
        }
        out
    }

    fn apply(&self, pos: &mut Position, color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Spawn { square, kind } = target else {
            return;
        };
        let id = pos.alloc_id();
        let mut piece = Piece::new(id, kind, color, square);
        piece.mirage = true;
        pos.board[square as usize] = Some(piece);
        ev.push(Event::Spawned { square, piece });
    }
}
