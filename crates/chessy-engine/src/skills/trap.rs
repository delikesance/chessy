use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// Lays a hidden trap on an empty square: the first enemy piece to cross it
/// stops there and is frozen for two of its turns. At most two traps per player.
pub struct Trap;

const MAX_TRAPS: usize = 2;

impl Skill for Trap {
    fn id(&self) -> SkillId {
        SkillId::Trap
    }

    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget> {
        let mine = |s: Square| pos.traps.iter().any(|t| t.owner == color && t.square == s);
        if pos.traps.iter().filter(|t| t.owner == color).count() >= MAX_TRAPS {
            return Vec::new();
        }
        // Only the player's own traps rule a square out: the opponent's are
        // secret, so they must not change what can be targeted. Two traps of
        // different owners can share a square; each springs for the other side.
        (0..64u8)
            .filter(|&s| pos.board[s as usize].is_none() && !mine(s))
            .map(|square| SkillTarget::Square { square })
            .collect()
    }

    fn apply(&self, pos: &mut Position, color: Color, target: SkillTarget, ev: &mut Vec<Event>) {
        let SkillTarget::Square { square } = target else {
            return;
        };
        pos.traps.push(crate::types::Trap {
            square,
            owner: color,
        });
        ev.push(Event::TrapSet { square });
    }
}
