use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use serde::{Deserialize, Serialize};

use crate::position::Position;
use crate::skills::{skill, SkillId, SkillTarget};
use crate::types::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillSlot {
    pub skill: SkillId,
    /// True once `uses` has reached the skill's `max_uses`.
    pub used: bool,
    /// How many times the skill has been used this game.
    #[serde(default)]
    pub uses: u8,
}

/// The skills one player brought to this game. Each can be used once (Mind
/// Reading three times).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Loadout {
    pub slots: Vec<SkillSlot>,
}

impl Loadout {
    pub fn new(skills: &[SkillId]) -> Self {
        Loadout {
            slots: skills
                .iter()
                .map(|&skill| SkillSlot {
                    skill,
                    used: false,
                    uses: 0,
                })
                .collect(),
        }
    }

    pub fn has_unused(&self) -> bool {
        self.slots.iter().any(|s| !s.used)
    }
}

/// Pairs are unordered; targets are generated with a < b.
fn normalize(target: SkillTarget) -> SkillTarget {
    match target {
        SkillTarget::Pair { a, b } => SkillTarget::Pair {
            a: a.min(b),
            b: a.max(b),
        },
        other => other,
    }
}

#[derive(Clone, Debug)]
pub struct Game {
    pub pos: Position,
    pub loadouts: [Loadout; 2],
    outcome: Outcome,
    seen: HashMap<u64, u8>,
}

impl Game {
    pub fn new(white: &[SkillId], black: &[SkillId]) -> Self {
        Self::from_position(Position::startpos(), white, black)
    }

    pub fn from_position(pos: Position, white: &[SkillId], black: &[SkillId]) -> Self {
        let mut game = Game {
            pos,
            loadouts: [Loadout::new(white), Loadout::new(black)],
            outcome: Outcome::Ongoing,
            seen: HashMap::new(),
        };
        game.record_position();
        game.outcome = game.compute_outcome();
        game
    }

    pub fn outcome(&self) -> Outcome {
        self.outcome
    }

    pub fn side_to_move(&self) -> Color {
        self.pos.side
    }

    pub fn loadout(&self, color: Color) -> &Loadout {
        &self.loadouts[color.index()]
    }

    /// Every action the side to move may take: moves plus unused skills.
    pub fn legal_actions(&self) -> Vec<Action> {
        self.legal_actions_on(&self.pos)
    }

    /// The actions the side to move may take as far as `view` shows: `view` is
    /// a position derived from the real one (the server removes what a player
    /// cannot see) and it, not the real position, decides what is listed. The
    /// loadouts and the outcome are the game's own, so the list is a function
    /// of what the player knows, whatever the real position hides.
    pub fn legal_actions_on(&self, view: &Position) -> Vec<Action> {
        if self.outcome.is_over() {
            return Vec::new();
        }
        let mut actions: Vec<Action> = view.legal_moves().into_iter().map(Action::from).collect();
        actions.extend(self.legal_skill_actions_on(view));
        actions
    }

    /// Whether `action` is one of [`Game::legal_actions_on`] for `view`.
    pub fn is_legal_on(&self, view: &Position, action: Action) -> bool {
        if self.outcome.is_over() {
            return false;
        }
        match action {
            Action::Move { from, to, promo } => {
                view.legal_moves().contains(&Move { from, to, promo })
            }
            Action::Skill { skill: id, target } => {
                let target = normalize(target);
                let color = view.side;
                self.loadouts[color.index()]
                    .slots
                    .iter()
                    .any(|s| s.skill == id && !s.used)
                    && skill(id).targets(view, color).contains(&target)
                    && view.skill_is_legal(id, target)
            }
        }
    }

    fn legal_skill_actions(&self) -> Vec<Action> {
        self.legal_skill_actions_on(&self.pos)
    }

    fn legal_skill_actions_on(&self, pos: &Position) -> Vec<Action> {
        let color = pos.side;
        let mut out = Vec::new();
        for slot in self.loadouts[color.index()]
            .slots
            .iter()
            .filter(|s| !s.used)
        {
            for target in skill(slot.skill).targets(pos, color) {
                if pos.skill_is_legal(slot.skill, target) {
                    out.push(Action::Skill {
                        skill: slot.skill,
                        target,
                    });
                }
            }
        }
        out
    }

    pub fn apply(&mut self, action: Action) -> Result<Vec<Event>, RuleError> {
        if self.outcome.is_over() {
            return Err(RuleError::GameOver);
        }
        let color = self.pos.side;
        let mut events = Vec::new();
        match action {
            Action::Move { from, to, promo } => {
                let mv = Move { from, to, promo };
                if !self.pos.legal_moves().contains(&mv) {
                    return Err(RuleError::IllegalAction);
                }
                self.pos.make_move(mv, &mut events);
            }
            Action::Skill {
                skill: id,
                mut target,
            } => {
                target = normalize(target);
                let slot = self.loadouts[color.index()]
                    .slots
                    .iter()
                    .position(|s| s.skill == id && !s.used)
                    .ok_or(RuleError::IllegalAction)?;
                if !skill(id).targets(&self.pos, color).contains(&target) {
                    return Err(RuleError::IllegalAction);
                }
                let (next, ev) = self
                    .pos
                    .try_skill(id, target)
                    .ok_or(RuleError::IllegalAction)?;
                let passed = next.ply != self.pos.ply;
                self.pos = next;
                let slot = &mut self.loadouts[color.index()].slots[slot];
                slot.uses = slot.uses.saturating_add(1);
                slot.used = slot.uses >= skill(id).max_uses();
                events = ev;
                if !passed {
                    // The same player acts again: nothing new to remember.
                    self.outcome = self.compute_outcome();
                    return Ok(events);
                }
            }
        }
        self.record_position();
        self.outcome = self.compute_outcome();
        Ok(events)
    }

    pub fn resign(&mut self, color: Color) {
        if !self.outcome.is_over() {
            self.outcome = Outcome::Resignation {
                winner: color.opposite(),
            };
        }
    }

    /// `color` ran out of time: the opponent wins.
    pub fn flag(&mut self, color: Color) {
        if !self.outcome.is_over() {
            self.outcome = Outcome::Timeout {
                winner: color.opposite(),
            };
        }
    }

    /// Both players agreed to a draw.
    pub fn agree_draw(&mut self) {
        if !self.outcome.is_over() {
            self.outcome = Outcome::DrawAgreed;
        }
    }

    fn position_hash(&self) -> u64 {
        let mut h = std::hash::DefaultHasher::new();
        for p in &self.pos.board {
            p.map(|p| (p.kind, p.color, p.mirage)).hash(&mut h);
        }
        self.pos.side.hash(&mut h);
        self.pos.castling.hash(&mut h);
        self.pos.en_passant.hash(&mut h);
        self.pos.effects.len().hash(&mut h);
        self.pos.traps.len().hash(&mut h);
        self.pos.benched.len().hash(&mut h);
        // Two identical boards with different graveyards are not the same
        // position once a skill can revive the dead.
        self.pos.graveyard.len().hash(&mut h);
        h.finish()
    }

    fn record_position(&mut self) {
        let hash = self.position_hash();
        *self.seen.entry(hash).or_insert(0) += 1;
    }

    fn compute_outcome(&self) -> Outcome {
        let color = self.pos.side;
        // Skills count as actions, so a position is only mate or stalemate when
        // the side to move can neither move nor use a skill.
        if self.pos.legal_moves().is_empty() && self.legal_skill_actions().is_empty() {
            return if self.pos.in_check(color) {
                Outcome::Checkmate {
                    winner: color.opposite(),
                }
            } else {
                Outcome::Stalemate
            };
        }
        if self.pos.halfmove >= 100 {
            return Outcome::FiftyMoves;
        }
        if self.seen.get(&self.position_hash()).copied().unwrap_or(0) >= 3 {
            return Outcome::Repetition;
        }
        if self.insufficient_material() {
            return Outcome::InsufficientMaterial;
        }
        Outcome::Ongoing
    }

    /// King vs king, or king and one minor piece vs king, with no skill left
    /// that could change that.
    fn insufficient_material(&self) -> bool {
        if self.loadouts.iter().any(Loadout::has_unused) || !self.pos.benched.is_empty() {
            return false;
        }
        let others: Vec<PieceKind> = self
            .pos
            .board
            .iter()
            .flatten()
            .map(|p| p.kind)
            .filter(|&k| k != PieceKind::King)
            .collect();
        matches!(
            others.as_slice(),
            [] | [PieceKind::Bishop] | [PieceKind::Knight]
        )
    }
}
