//! Skills: one file per skill, registered in [`skill`].

mod clone;
mod destiny_swapper;
mod freeze;
mod imune;
mod remover;
mod rollback;
mod teleportation;

use serde::{Deserialize, Serialize};

use crate::position::Position;
use crate::types::{Color, Event, Square};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillId {
    Teleportation,
    Imune,
    Freeze,
    Rollback,
    Clone,
    DestinySwapper,
    Remover,
}

impl SkillId {
    pub const ALL: [SkillId; 7] = [
        SkillId::Teleportation,
        SkillId::Imune,
        SkillId::Freeze,
        SkillId::Rollback,
        SkillId::Clone,
        SkillId::DestinySwapper,
        SkillId::Remover,
    ];

    pub fn kind(self) -> SkillKind {
        skill(self).kind()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillKind {
    /// Regular skill: counts toward the three picked for a game.
    Classic,
    /// Exists in exactly one deck in the whole world; does not count toward the three.
    Unique,
}

/// What a skill is aimed at.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SkillTarget {
    None,
    Piece { square: Square },
    PieceTo { from: Square, to: Square },
    Pair { a: Square, b: Square },
}

pub trait Skill: Sync {
    fn id(&self) -> SkillId;

    fn kind(&self) -> SkillKind {
        SkillKind::Classic
    }

    /// Whether the skill is refused when it would checkmate the opponent.
    fn forbids_mate(&self) -> bool {
        false
    }

    /// Structurally valid targets for `color`. King safety is checked by the
    /// caller, which simulates the skill on a copy of the position.
    fn targets(&self, pos: &Position, color: Color) -> Vec<SkillTarget>;

    /// Applies the skill's effect. Turn bookkeeping (en passant, castling
    /// rights, `end_turn`) is done by the caller.
    fn apply(&self, pos: &mut Position, color: Color, target: SkillTarget, ev: &mut Vec<Event>);
}

pub fn skill(id: SkillId) -> &'static dyn Skill {
    match id {
        SkillId::Teleportation => &teleportation::Teleportation,
        SkillId::Imune => &imune::Imune,
        SkillId::Freeze => &freeze::Freeze,
        SkillId::Rollback => &rollback::Rollback,
        SkillId::Clone => &clone::Clone,
        SkillId::DestinySwapper => &destiny_swapper::DestinySwapper,
        SkillId::Remover => &remover::Remover,
    }
}

impl Position {
    /// Plays a skill on a copy and returns the resulting position and events,
    /// or `None` when the skill would leave the caster's king in check (or
    /// checkmate the opponent, for skills that forbid it).
    pub fn try_skill(&self, id: SkillId, target: SkillTarget) -> Option<(Position, Vec<Event>)> {
        let color = self.side;
        let skill = skill(id);
        let mut next = self.clone();
        let mut ev = vec![Event::SkillUsed {
            color,
            skill: id,
            target,
        }];
        skill.apply(&mut next, color, target, &mut ev);
        next.en_passant = None;
        next.halfmove = 0;
        next.sanitize_castling();
        next.end_turn();
        if next.in_check(color) {
            return None;
        }
        if skill.forbids_mate() && next.in_check(color.opposite()) && next.legal_moves().is_empty()
        {
            return None;
        }
        Some((next, ev))
    }
}

/// Offsets of the eight squares around `s` that are on the board.
pub(crate) fn neighbors(s: Square) -> impl Iterator<Item = Square> {
    const DELTAS: [(i8, i8); 8] = [
        (1, 0),
        (1, 1),
        (0, 1),
        (-1, 1),
        (-1, 0),
        (-1, -1),
        (0, -1),
        (1, -1),
    ];
    DELTAS
        .into_iter()
        .filter_map(move |(df, dr)| crate::position::offset(s, df, dr))
}
