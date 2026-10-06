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
        if pos.traps.iter().filter(|t| t.owner == color).count() >= MAX_TRAPS {
            return Vec::new();
        }
        (0..64u8)
            .filter(|&s| pos.board[s as usize].is_none() && !pos.trap_at(s))
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
