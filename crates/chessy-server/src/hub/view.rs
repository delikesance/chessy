//! What each player may see of a game: hidden information (invisible pieces,
//! traps, the bench, Mind Reading hints) is filtered out of their `state`.

use std::collections::HashSet;

use chessy_engine::{
    ActiveEffect, Color, EffectKind, Event, Game, Loadout, Piece, PieceId, Position, SkillId,
    SkillTarget, Square,
};

use crate::protocol::{SkillSlotView, TerrainView};

/// Pieces of `viewer`'s opponent that `viewer` cannot see (Invisibility).
pub(super) fn hidden_ids(pos: &Position, viewer: Color) -> HashSet<PieceId> {
    let mut hidden = HashSet::new();
    for e in &pos.effects {
        if e.kind != EffectKind::Invisible {
            continue;
        }
        let color = pos
            .board
            .iter()
            .flatten()
            .find(|p| p.id == e.piece)
            .map(|p| p.color)
            .or_else(|| {
                pos.benched
                    .iter()
                    .find(|b| b.piece.id == e.piece)
                    .map(|b| b.piece.color)
            });
        if color == Some(viewer.opposite()) {
            hidden.insert(e.piece);
        }
    }
    hidden
}

/// Pieces a spectator cannot see: the invisible ones of both sides.
pub(super) fn spectator_hidden(pos: &Position) -> HashSet<PieceId> {
    let mut hidden = hidden_ids(pos, Color::White);
    hidden.extend(hidden_ids(pos, Color::Black));
    hidden
}

/// The board as `viewer` sees it: hidden pieces are empty squares.
pub(super) fn board(pos: &Position, hidden: &HashSet<PieceId>) -> Vec<Option<Piece>> {
    pos.board
        .iter()
        .map(|p| p.filter(|p| !hidden.contains(&p.id)))
        .collect()
}

pub(super) fn effects(pos: &Position, hidden: &HashSet<PieceId>) -> Vec<ActiveEffect> {
    pos.effects
        .iter()
        .filter(|e| e.kind != EffectKind::Terrain && !hidden.contains(&e.piece))
        .copied()
        .collect()
}

pub(super) fn terrain(pos: &Position) -> Vec<TerrainView> {
    pos.effects
        .iter()
        .filter(|e| e.kind == EffectKind::Terrain)
        .filter_map(|e| {
            Some(TerrainView {
                square: e.square?,
                owner: e.owner?,
                expires_at: e.expires_at,
            })
        })
        .collect()
}

pub(super) fn own_traps(pos: &Position, viewer: Color) -> Vec<Square> {
    pos.traps
        .iter()
        .filter(|t| t.owner == viewer)
        .map(|t| t.square)
        .collect()
}

pub(super) fn own_benched(pos: &Position, viewer: Color) -> Vec<Piece> {
    pos.benched
        .iter()
        .filter(|b| b.piece.color == viewer)
        .map(|b| b.piece)
        .collect()
}

pub(super) fn skills(loadout: &Loadout) -> Vec<SkillSlotView> {
    loadout
        .slots
        .iter()
        .map(|s| SkillSlotView {
            skill: s.skill,
            used: s.used,
            uses: s.uses,
            max_uses: s.skill.max_uses(),
        })
        .collect()
}

fn target_squares(target: SkillTarget) -> Vec<Square> {
    match target {
        SkillTarget::None => Vec::new(),
        SkillTarget::Piece { square }
        | SkillTarget::Square { square }
        | SkillTarget::Spawn { square, .. } => vec![square],
        SkillTarget::PieceTo { from, to } => vec![from, to],
        SkillTarget::Pair { a, b } => vec![a, b],
    }
}

/// What happened, minus what `viewer` is not supposed to learn from it.
pub(super) fn events(
    events: Vec<Event>,
    viewer: Color,
    game: &Game,
    hidden: &HashSet<PieceId>,
) -> Vec<Event> {
    // Hidden pieces still stand on the real board.
    let hidden_square =
        |s: Square| game.pos.board[s as usize].is_some_and(|p| hidden.contains(&p.id));
    let actor = events.iter().find_map(|e| match e {
        Event::SkillUsed { color, .. } => Some(*color),
        _ => None,
    });
    let mine = actor == Some(viewer);
    events
        .into_iter()
        .filter_map(|event| match event {
            Event::SkillUsed {
                color,
                skill,
                target,
            } if color != viewer => {
                let secret = matches!(skill, SkillId::Trap | SkillId::Invisibility)
                    || target_squares(target).into_iter().any(hidden_square);
                Some(Event::SkillUsed {
                    color,
                    skill,
                    target: if secret { SkillTarget::None } else { target },
                })
            }
            Event::BestMove { .. } | Event::TrapSet { .. } if !mine => None,
            Event::EffectAdded { effect, piece, .. }
                if (effect == EffectKind::Invisible && !mine) || hidden.contains(&piece) =>
            {
                None
            }
            Event::Moved { piece, .. }
            | Event::Pushed { piece, .. }
            | Event::Saved { piece, .. }
                if hidden.contains(&piece) =>
            {
                None
            }
            Event::Spawned { piece, .. }
            | Event::Switched { piece, .. }
            | Event::Benched { piece, .. }
            | Event::Unbenched { piece, .. }
            | Event::Vanished { piece, .. }
            | Event::LoanEnded { piece, .. }
                if hidden.contains(&piece.id) =>
            {
                None
            }
            Event::Teleported { to: s, .. }
            | Event::RolledBack { to: s, .. }
            | Event::Transformed { square: s, .. }
                if hidden_square(s) =>
            {
                None
            }
            Event::Rotated { moves } => Some(Event::Rotated {
                moves: moves.into_iter().filter(|m| !hidden_square(m.to)).collect(),
            }),
            Event::Cloned { from, .. } if hidden_square(from) => None,
            Event::Swapped { a, b } if hidden_square(a) || hidden_square(b) => None,
            other => Some(other),
        })
        .collect()
}

/// Events for a spectator: filtered as for the opponent of each side in turn,
/// so nothing either side hides leaks (the first pass hides Black's secrets
/// from White and the second White's from Black).
pub(super) fn spectator_events(
    all: Vec<Event>,
    game: &Game,
    hidden: &HashSet<PieceId>,
) -> Vec<Event> {
    let once = events(all, Color::White, game, hidden);
    events(once, Color::Black, game, hidden)
}
