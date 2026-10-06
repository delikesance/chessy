//! Skills: one file per skill, registered in [`skill`].

mod bench;
mod canceller;
mod celestial;
mod clone;
mod control;
mod destiny_swapper;
mod evolve;
mod forcefield;
mod freeze;
mod geomancy;
mod godhelp;
mod imune;
mod invisibility;
mod mind;
mod mirage;
mod morph;
mod queensac;
mod remover;
mod rollback;
mod switch;
mod teleportation;
mod temporal;
mod terminator;
mod tornado;
mod transposition;
mod trap;
mod wall;

use serde::{Deserialize, Serialize};

use crate::position::{Position, Snapshot};
use crate::types::{Color, Event, PieceKind, Square};

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
    Wall,
    Mirage,
    Evolve,
    Switch,
    Mind,
    Control,
    Morph,
    Canceller,
    Tornado,
    Invisibility,
    Terminator,
    Trap,
    Bench,
    Forcefield,
    Transposition,
    Queensac,
    Temporal,
    Geomancy,
    Celestial,
    Godhelp,
}

impl SkillId {
    pub const ALL: [SkillId; 27] = [
        SkillId::Teleportation,
        SkillId::Imune,
        SkillId::Freeze,
        SkillId::Rollback,
        SkillId::Clone,
        SkillId::DestinySwapper,
        SkillId::Remover,
        SkillId::Wall,
        SkillId::Mirage,
        SkillId::Evolve,
        SkillId::Switch,
        SkillId::Mind,
        SkillId::Control,
        SkillId::Morph,
        SkillId::Canceller,
        SkillId::Tornado,
        SkillId::Invisibility,
        SkillId::Terminator,
        SkillId::Trap,
        SkillId::Bench,
        SkillId::Forcefield,
        SkillId::Transposition,
        SkillId::Queensac,
        SkillId::Temporal,
        SkillId::Geomancy,
        SkillId::Celestial,
        SkillId::Godhelp,
    ];

    pub fn kind(self) -> SkillKind {
        skill(self).kind()
    }

    /// How many times the skill may be used in one game.
    pub fn max_uses(self) -> u8 {
        skill(self).max_uses()
    }

    /// Whether using the skill hands the turn over.
    pub fn ends_turn(self) -> bool {
        skill(self).ends_turn()
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
    Piece {
        square: Square,
    },
    PieceTo {
        from: Square,
        to: Square,
    },
    Pair {
        a: Square,
        b: Square,
    },
    /// An empty square.
    Square {
        square: Square,
    },
    /// A square and the type of piece to make there. The type is called
    /// `piece` in JSON because `kind` is the tag.
    Spawn {
        square: Square,
        #[serde(rename = "piece")]
        kind: PieceKind,
    },
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
    /// Whether the skill is refused when either king would be in check after it.
    fn forbids_check(&self) -> bool {
        false
    }
    /// Whether using the skill hands the turn over. A skill that does not
    /// leaves the same player to act again: it is only allowed if they then
    /// have a legal move and the opponent's king is not in check.
    fn ends_turn(&self) -> bool {
        true
    }
    /// How many times a game the skill can be used.
    fn max_uses(&self) -> u8 {
        1
    }
    /// A skill that only reports something and leaves the position untouched.
    fn informational(&self) -> bool {
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
        SkillId::Wall => &wall::Wall,
        SkillId::Mirage => &mirage::Mirage,
        SkillId::Evolve => &evolve::Evolve,
        SkillId::Switch => &switch::Switch,
        SkillId::Mind => &mind::Mind,
        SkillId::Control => &control::Control,
        SkillId::Morph => &morph::Morph,
        SkillId::Canceller => &canceller::Canceller,
        SkillId::Tornado => &tornado::Tornado,
        SkillId::Invisibility => &invisibility::Invisibility,
        SkillId::Terminator => &terminator::Terminator,
        SkillId::Trap => &trap::Trap,
        SkillId::Bench => &bench::Bench,
        SkillId::Forcefield => &forcefield::Forcefield,
        SkillId::Transposition => &transposition::Transposition,
        SkillId::Queensac => &queensac::Queensac,
        SkillId::Temporal => &temporal::Temporal,
        SkillId::Geomancy => &geomancy::Geomancy,
        SkillId::Celestial => &celestial::Celestial,
        SkillId::Godhelp => &godhelp::Godhelp,
    }
}

impl Position {
    /// Plays a skill on a copy and returns the resulting position and events,
    /// or `None` when the skill is refused: it would leave the caster's king in
    /// check (or checkmate the opponent, for skills that forbid it), or, for a
    /// skill that does not pass the turn, leave the caster without a legal move.
    pub fn try_skill(&self, id: SkillId, target: SkillTarget) -> Option<(Position, Vec<Event>)> {
        self.simulate_skill(id, target, true)
    }

    /// Like [`Position::try_skill`] but only says whether the skill is allowed
    /// (cheaper: no snapshot, and Mind Reading does not search).
    pub fn skill_is_legal(&self, id: SkillId, target: SkillTarget) -> bool {
        if skill(id).informational() {
            return !self.legal_moves().is_empty();
        }
        self.simulate_skill(id, target, false).is_some()
    }

    fn simulate_skill(
        &self,
        id: SkillId,
        target: SkillTarget,
        full: bool,
    ) -> Option<(Position, Vec<Event>)> {
        let color = self.side;
        let skill = skill(id);
        let mut next = self.clone();
        let mut ev = vec![Event::SkillUsed {
            color,
            skill: id,
            target,
        }];
        if !skill.ends_turn() {
            if skill.informational() && self.legal_moves().is_empty() {
                return None;
            }
            skill.apply(&mut next, color, target, &mut ev);
            if !skill.informational() {
                // The position changed in the middle of a turn: nothing to cancel.
                next.last_skill_snapshot = None;
            }
            // The same player moves next, so the opponent's king must not be
            // in check (it could be taken), and there must be a move to make.
            if next.in_check(color.opposite()) || next.legal_moves().is_empty() {
                return None;
            }
            return Some((next, ev));
        }
        skill.apply(&mut next, color, target, &mut ev);
        next.en_passant = None;
        next.halfmove = 0;
        next.sanitize_castling();
        next.end_turn_events(&mut ev);
        if next.in_check(color) {
            return None;
        }
        if skill.forbids_check() && next.in_check(color.opposite()) {
            return None;
        }
        if skill.forbids_mate() && next.in_check(color.opposite()) && next.legal_moves().is_empty()
        {
            return None;
        }
        next.last_skill_snapshot = full.then(|| {
            let mut before = self.clone();
            before.last_skill_snapshot = None;
            Box::new(Snapshot {
                position: before,
                skill: id,
            })
        });
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
