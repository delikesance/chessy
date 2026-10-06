use super::{Skill, SkillId, SkillTarget};
use crate::position::{offset, Position};
use crate::types::*;

/// One of your pieces (not the king) repeats its last move: the same step
/// again from where it stands, if it lands on an empty square or takes an
/// enemy piece. This replaces the move of the turn.
pub struct Temporal;

/// Where `piece` on `from` would land by repeating its last move.
fn replay(pos: &Position, from: Square, piece: &Piece) -> Option<Square> {
    let prev = piece.prev?;
    let df = file_of(from) as i8 - file_of(prev) as i8;
    let dr = rank_of(from) as i8 - rank_of(prev) as i8;
    let to = offset(from, df, dr)?;
    if !Position::can_stand(piece.kind, to) {
        return None;
    }
    match pos.board[to as usize] {
        None => pos.can_place(piece.color, piece.kind, to).then_some(to),
        Some(victim) => {
            let free = pos.blocked_mask(piece.color) & (1u64 << to) == 0;
            (!piece.mirage
                && free
                && victim.color != piece.color
                && victim.kind != PieceKind::King
                && !pos.is_immune(victim.id))
            .then_some(to)
        }
    }
}

impl Skill for Temporal {
    fn id(&self) -> SkillId {
        SkillId::Temporal
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        pos.pieces(color)
            .filter(|(_, p)| p.kind != PieceKind::King && !pos.is_frozen(p.id))
            .filter(|(from, p)| replay(pos, *from, p).is_some())
            .map(|(square, _)| SkillTarget::Piece { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, _color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Piece { square: from } = target else {
            return;
        };
        let mut piece = pos.board[from as usize].expect("temporal target");
        let to = replay(pos, from, &piece).expect("temporal destination");
        pos.board[from as usize] = None;
        let reaction = match pos.board[to as usize].take() {
            Some(victim) => pos.begin_capture(to, victim, ev),
            None => crate::position::Reaction::None,
        };
        ev.push(Event::Moved {
            from,
            to,
            piece: piece.id,
        });
        piece.prev = Some(from);
        pos.board[to as usize] = Some(piece);
        pos.finish_capture(reaction, from, to, ev);
    }
}
