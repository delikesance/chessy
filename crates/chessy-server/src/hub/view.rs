//! What each player may see of a game: hidden information (invisible pieces,
//! traps, the bench, Mind Reading hints) is filtered out of their `state`.

use std::collections::HashSet;

use chessy_engine::{
    ActiveEffect, Color, EffectKind, Event, Game, Loadout, Piece, PieceId, Position, SkillId,
    SkillTarget, Square, NEVER,
};

use crate::protocol::{SkillSlotView, TerrainView};

/// Pieces of `viewer`'s opponent that `viewer` cannot see (Invisibility).
///
/// A hidden piece that gives check to the king of `viewer`, whose turn it is,
/// is unmasked for as long as the check lasts: check is always announced, and
/// the player has to see what attacks them to be able to answer it.
pub(super) fn hidden_ids(pos: &Position, viewer: Color) -> HashSet<PieceId> {
    let mut hidden = invisible_of(pos, viewer);
    if !hidden.is_empty() && pos.side == viewer && pos.in_check(viewer) {
        hidden.retain(|&id| !gives_check(pos, viewer, id));
    }
    hidden
}

/// Whether the enemy piece `id` alone attacks the king of `viewer`: every
/// other enemy piece is frozen (frozen pieces attack nothing but still block).
fn gives_check(pos: &Position, viewer: Color, id: PieceId) -> bool {
    let mut probe = pos.clone();
    let others: Vec<PieceId> = pos
        .pieces(viewer.opposite())
        .map(|(_, p)| p.id)
        .filter(|&other| other != id)
        .collect();
    for other in others {
        probe
            .effects
            .push(ActiveEffect::new(EffectKind::Frozen, other, NEVER));
    }
    probe.in_check(viewer)
}

/// The position `viewer` plays on: the real one minus what they cannot see,
/// that is the `hidden` pieces (and what is attached to them) and the traps
/// of the opponent. Legal moves and skill targets are listed on this position
/// and a played action must be legal on it, so that nothing the player is
/// offered depends on a secret; the real position only judges the outcome.
pub(super) fn view_position(pos: &Position, viewer: Color, hidden: &HashSet<PieceId>) -> Position {
    let mut view = pos.clone();
    strip(&mut view, viewer, hidden);
    view
}

fn strip(pos: &mut Position, viewer: Color, hidden: &HashSet<PieceId>) {
    for square in pos.board.iter_mut() {
        if square.is_some_and(|p| hidden.contains(&p.id)) {
            *square = None;
        }
    }
    pos.effects.retain(|e| !hidden.contains(&e.piece));
    pos.benched.retain(|b| !hidden.contains(&b.piece.id));
    pos.traps.retain(|t| t.owner == viewer);
    // Canceller restores that earlier position: it holds the same secrets.
    if let Some(snapshot) = &mut pos.last_skill_snapshot {
        strip(&mut snapshot.position, viewer, hidden);
    }
}

/// Mind Reading names the best move of the position the player sees: a
/// search on the real one would point at hidden pieces and traps.
pub(super) fn mask_best_move(game: &Game, mover: Color, events: &mut Vec<Event>) {
    if !events.iter().any(|e| matches!(e, Event::BestMove { .. })) {
        return;
    }
    let hidden = hidden_ids(&game.pos, mover);
    let view = view_position(&game.pos, mover, &hidden);
    let hint = chessy_engine::search::best_move(&view, 3);
    events.retain(|e| !matches!(e, Event::BestMove { .. }));
    if let Some(mv) = hint {
        events.push(Event::BestMove {
            from: mv.from,
            to: mv.to,
            promo: mv.promo,
        });
    }
}

fn invisible_of(pos: &Position, viewer: Color) -> HashSet<PieceId> {
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
    // A check never unmasks a piece for spectators: they act for nobody.
    let mut hidden = invisible_of(pos, Color::White);
    hidden.extend(invisible_of(pos, Color::Black));
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

#[cfg(test)]
mod tests {
    use chessy_engine::{parse_square, Action, Trap};

    use super::*;

    fn sq(name: &str) -> Square {
        parse_square(name).unwrap()
    }

    fn hide(pos: &mut Position, at: &str) -> PieceId {
        let id = pos.board[sq(at) as usize].expect("a piece to hide").id;
        pos.effects
            .push(ActiveEffect::new(EffectKind::Invisible, id, 99));
        id
    }

    fn best(events: &[Event]) -> Option<(Square, Square)> {
        events.iter().find_map(|e| match e {
            Event::BestMove { from, to, .. } => Some((*from, *to)),
            _ => None,
        })
    }

    #[test]
    fn mind_reading_does_not_point_at_a_hidden_piece() {
        // White wins the black queen with exd5, but black hid it.
        let mut pos = Position::from_fen("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1").unwrap();
        hide(&mut pos, "d5");
        let mut game = Game::from_position(pos, &[SkillId::Mind], &[]);
        let mut events = game
            .apply(Action::Skill {
                skill: SkillId::Mind,
                target: SkillTarget::None,
            })
            .unwrap();
        assert_eq!(
            best(&events),
            Some((sq("e4"), sq("d5"))),
            "the real best move"
        );
        mask_best_move(&game, Color::White, &mut events);
        let hint = best(&events).expect("some hint");
        assert_ne!(hint.1, sq("d5"), "{hint:?} points at the hidden queen");
    }

    #[test]
    fn the_view_has_no_hidden_pieces_and_no_enemy_traps() {
        let mut pos = Position::from_fen("4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1").unwrap();
        let queen = hide(&mut pos, "d5");
        pos.traps.push(Trap {
            square: sq("c4"),
            owner: Color::Black,
        });
        pos.traps.push(Trap {
            square: sq("g1"),
            owner: Color::White,
        });
        let hidden = hidden_ids(&pos, Color::White);
        assert!(hidden.contains(&queen));
        let seen = view_position(&pos, Color::White, &hidden);
        assert!(seen.board[sq("d5") as usize].is_none());
        assert!(seen.effects.is_empty());
        assert_eq!(seen.traps.len(), 1);
        assert_eq!(seen.traps[0].owner, Color::White);
        // Black sees its own queen and its own trap.
        let hidden = hidden_ids(&pos, Color::Black);
        assert!(hidden.is_empty());
        let seen = view_position(&pos, Color::Black, &hidden);
        assert!(seen.board[sq("d5") as usize].is_some());
        assert_eq!(seen.traps.len(), 1);
    }

    #[test]
    fn an_enemy_trap_is_not_visible_in_what_is_offered() {
        // Black is in check from Re1; Rxe1 answers it, but a white trap on c1
        // would stop the rook short. The list must not know about the trap.
        let mut pos = Position::from_fen("4k3/8/8/8/8/8/7K/r3R3 b - - 0 1").unwrap();
        pos.traps.push(Trap {
            square: sq("c1"),
            owner: Color::White,
        });
        let game = Game::from_position(pos, &[], &[]);
        let take = Action::Move {
            from: sq("a1"),
            to: sq("e1"),
            promo: None,
        };
        assert!(!game.legal_actions().contains(&take), "the real position");
        let hidden = hidden_ids(&game.pos, Color::Black);
        let seen = view_position(&game.pos, Color::Black, &hidden);
        assert!(game.legal_actions_on(&seen).contains(&take));
        assert!(game.is_legal_on(&seen, take));
    }

    #[test]
    fn a_hidden_checker_is_unmasked_only_while_it_checks() {
        // The white queen on h5 is hidden and checks the black king (black to move).
        let mut pos = Position::from_fen("4k3/8/8/7Q/8/8/8/4K3 b - - 0 1").unwrap();
        let queen = hide(&mut pos, "h5");
        assert!(pos.in_check(Color::Black));
        assert!(!hidden_ids(&pos, Color::Black).contains(&queen));
        // Hidden pieces that do not give check stay hidden.
        let mut quiet = Position::from_fen("4k3/8/8/8/8/Q7/8/4K3 b - - 0 1").unwrap();
        let queen = hide(&mut quiet, "a3");
        assert!(!quiet.in_check(Color::Black));
        assert!(hidden_ids(&quiet, Color::Black).contains(&queen));
        // Of two hidden pieces only the one that really checks is unmasked.
        let mut pair = Position::from_fen("4k3/8/8/7Q/8/8/8/R3K3 b - - 0 1").unwrap();
        let rook = hide(&mut pair, "a1");
        let queen = hide(&mut pair, "h5");
        let hidden = hidden_ids(&pair, Color::Black);
        assert!(hidden.contains(&rook));
        assert!(!hidden.contains(&queen));
        // Spectators never get anything unmasked.
        assert!(spectator_hidden(&pair).contains(&queen));
    }
}
