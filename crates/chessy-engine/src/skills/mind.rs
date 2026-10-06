use super::{Skill, SkillId, SkillKind, SkillTarget};
use crate::position::Position;
use crate::search;
use crate::types::*;

/// Unique skill: names the best move of the side to move. Three uses, and it
/// does not use up the turn.
pub struct Mind;

impl Skill for Mind {
    fn id(&self) -> SkillId {
        SkillId::Mind
    }

    fn kind(&self) -> SkillKind {
        SkillKind::Unique
    }

    fn ends_turn(&self) -> bool {
        false
    }

    fn max_uses(&self) -> u8 {
        3
    }

    fn informational(&self) -> bool {
        true
    }

    fn targets(&self, pos: &Position, _color: Color) -> Vec<SkillTarget> {
        if pos.legal_moves().is_empty() {
            Vec::new()
        } else {
            vec![SkillTarget::None]
        }
    }

    fn apply(&self, pos: &mut Position, _color: Color, _target: SkillTarget, ev: &mut Vec<Event>) {
        if let Some(mv) = search::best_move(pos, 3) {
            ev.push(Event::BestMove {
                from: mv.from,
                to: mv.to,
                promo: mv.promo,
            });
        }
    }
}
