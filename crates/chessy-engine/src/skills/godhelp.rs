use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// A temporary piece of a type and on a square the position decides (never
/// chosen by the player) appears on ranks 3 to 6 and serves for three turns.
pub struct Godhelp;

const KINDS: [PieceKind; 4] = [
    PieceKind::Knight,
    PieceKind::Bishop,
    PieceKind::Rook,
    PieceKind::Queen,
];

/// A deterministic hash of the moment (FNV-1a over the ply and the pieces), so
/// the "random" choice is a pure function of the position.
fn seed(pos: &Position) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    let mut feed = |x: u64| {
        h ^= x;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    };
    feed(pos.ply as u64);
    feed(pos.side.index() as u64);
    for (i, p) in pos.board.iter().enumerate() {
        if let Some(p) = p {
            feed(i as u64 * 64 + p.kind as u64 * 2 + p.color.index() as u64 + 1);
        }
    }
    // Spread the low bits.
    h ^= h >> 29;
    h = h.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    h ^ (h >> 32)
}

fn candidates(pos: &Position, color: Color) -> Vec<Square> {
    (16..48u8)
        .filter(|&s| pos.can_place(color, PieceKind::Knight, s))
        .collect()
}

impl Skill for Godhelp {
    fn id(&self) -> SkillId {
        SkillId::Godhelp
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        if candidates(pos, color).is_empty() {
            Vec::new()
        } else {
            vec![SkillTarget::None]
        }
    }

    fn apply(&self, pos: &mut Position, color: Color, _target: SkillTarget, ev: &mut Vec<Event>) {
        let squares = candidates(pos, color);
        let h = seed(pos);
        let square = squares[(h % squares.len() as u64) as usize];
        let kind = KINDS[((h >> 40) % KINDS.len() as u64) as usize];
        let id = pos.alloc_id();
        let mut piece = Piece::new(id, kind, color, square);
        piece.temp = true;
        pos.board[square as usize] = Some(piece);
        ev.push(Event::Spawned { square, piece });
        // Three turns of the caster: gone at the end of the third.
        ev.push(pos.add_effect(EffectKind::Vanish, id, 7));
    }
}
