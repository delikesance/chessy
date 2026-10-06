use super::{neighbors, Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::{Color, Event, Piece, PieceKind};

/// Copies one of your pieces (not the king) onto an adjacent empty square.
pub struct Clone;

impl Skill for Clone {
    fn id(&self) -> SkillId {
        SkillId::Clone
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        let mut out = Vec::new();
        for (from, piece) in pos.pieces(color) {
            if piece.kind == PieceKind::King {
                continue;
            }
            for to in neighbors(from) {
                if pos.board[to as usize].is_none() && Position::can_stand(piece.kind, to) {
                    out.push(SkillTarget::PieceTo { from, to });
                }
            }
        }
        out
    }

    fn apply(&self, pos: &mut Position, _color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::PieceTo { from, to } = target else {
            return;
        };
        let original = pos.board[from as usize].expect("clone source");
        let copy = Piece {
            id: pos.alloc_id(),
            prev: None,
            ..original
        };
        pos.board[to as usize] = Some(copy);
        ev.push(Event::Cloned {
            from,
            to,
            piece: copy,
        });
    }
}
