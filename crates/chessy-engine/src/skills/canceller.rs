use super::{Skill, SkillId, SkillTarget};
use crate::position::Position;
use crate::types::*;

/// Undoes the skill the opponent has just used (only possible right after it).
/// The skill stays spent for them; the turn passes.
pub struct Canceller;

impl Skill for Canceller {
    fn id(&self) -> SkillId {
        SkillId::Canceller
    }

    fn targets(&self, pos: &Position, _color: Color) -> Vec<SkillTarget> {
        if pos.last_skill_snapshot.is_some() {
            vec![SkillTarget::None]
        } else {
            Vec::new()
        }
    }

    fn apply(&self, pos: &mut Position, _color: Color, _target: SkillTarget, ev: &mut Vec<Event>) {
        let Some(snapshot) = pos.last_skill_snapshot.take() else {
            return;
        };
        let skill = snapshot.skill;
        let mut restored = snapshot.position;
        // Time went on while the cancelled skill was in effect: push expiries
        // forward by the plies that passed so remaining durations are kept.
        let shift = pos.ply.saturating_sub(restored.ply);
        for e in &mut restored.effects {
            if e.expires_at != NEVER {
                e.expires_at = e.expires_at.saturating_add(shift);
            }
        }
        for b in &mut restored.benched {
            b.back_at = b.back_at.saturating_add(shift);
        }
        // A loan still running in the snapshot ended with the turn it was made in.
        for e in restored
            .effects
            .iter()
            .filter(|e| e.kind == EffectKind::ColorLoan)
            .copied()
            .collect::<Vec<_>>()
        {
            if let (Some(back), Some(s)) = (e.orig_color, restored.find_piece(e.piece)) {
                if let Some(p) = restored.board[s as usize].as_mut() {
                    p.color = back;
                }
            }
        }
        restored.effects.retain(|e| e.kind != EffectKind::ColorLoan);
        restored.side = pos.side;
        restored.ply = pos.ply;
        restored.fullmove = pos.fullmove;
        restored.next_id = restored.next_id.max(pos.next_id);
        restored.last_skill_snapshot = None;
        *pos = restored;
        ev.push(Event::Cancelled { skill });
    }
}
