//! French algebraic notation for the actions of a game (`Cf3`, `exd5`,
//! `O-O`, `e8=D+`, `Dh4#`) and a readable line for each skill.
//!
//! Pieces are `R` (roi), `D` (dame), `T` (tour), `F` (fou) and `C` (cavalier);
//! pawns carry no letter. `+` marks a check and `#` a mate.

use crate::position::Position;
use crate::skills::{SkillId, SkillTarget};
use crate::types::*;

/// The letter of a piece in French notation (empty for a pawn).
pub fn piece_letter(kind: PieceKind) -> &'static str {
    match kind {
        PieceKind::King => "R",
        PieceKind::Queen => "D",
        PieceKind::Rook => "T",
        PieceKind::Bishop => "F",
        PieceKind::Knight => "C",
        PieceKind::Pawn => "",
    }
}

/// The name of a piece type in French, for skills that name one (Mirage, Morph).
pub fn piece_name(kind: PieceKind) -> &'static str {
    match kind {
        PieceKind::King => "Roi",
        PieceKind::Queen => "Dame",
        PieceKind::Rook => "Tour",
        PieceKind::Bishop => "Fou",
        PieceKind::Knight => "Cavalier",
        PieceKind::Pawn => "Pion",
    }
}

/// The name a skill goes by (the same as in the client's catalogue).
pub fn skill_name(skill: SkillId) -> &'static str {
    match skill {
        SkillId::Teleportation => "Teleportation",
        SkillId::Imune => "Imune",
        SkillId::Freeze => "Freeze",
        SkillId::Rollback => "Rollback",
        SkillId::Clone => "Clone",
        SkillId::DestinySwapper => "Destiny Swapper",
        SkillId::Remover => "Remover",
        SkillId::Wall => "Wall",
        SkillId::Mirage => "Mirage",
        SkillId::Evolve => "Evolve",
        SkillId::Switch => "Switch Sides",
        SkillId::Mind => "Mind Reading",
        SkillId::Control => "Mind Control",
        SkillId::Morph => "Morph",
        SkillId::Canceller => "Canceller",
        SkillId::Tornado => "Tornado",
        SkillId::Invisibility => "Invisibility",
        SkillId::Terminator => "Terminator",
        SkillId::Trap => "Trap Card",
        SkillId::Bench => "The Bench",
        SkillId::Forcefield => "Force Field",
        SkillId::Transposition => "Transposition",
        SkillId::Queensac => "Queen Sacrifice",
        SkillId::Temporal => "Temporal Distortion",
        SkillId::Geomancy => "Geomancy",
        SkillId::Celestial => "Celestial Intervention",
        SkillId::Godhelp => "God Help",
    }
}

/// `Teleportation e2→e4`, `Freeze sur e5`, `Destiny Swapper b1↔g1`,
/// `Mirage sur f3 (Cavalier)`, or just the name for a skill with no target.
pub fn skill_notation(skill: SkillId, target: SkillTarget) -> String {
    let name = skill_name(skill);
    match target {
        SkillTarget::None => name.to_string(),
        SkillTarget::Piece { square } | SkillTarget::Square { square } => {
            format!("{name} sur {}", square_name(square))
        }
        SkillTarget::PieceTo { from, to } => {
            format!("{name} {}→{}", square_name(from), square_name(to))
        }
        SkillTarget::Pair { a, b } => format!("{name} {}↔{}", square_name(a), square_name(b)),
        SkillTarget::Spawn { square, kind } => {
            format!("{name} sur {} ({})", square_name(square), piece_name(kind))
        }
    }
}

/// Where the move really ended, which can be short of `mv.to` when a trap stopped a slider.
fn landing(mv: Move, piece: Piece, events: &[Event]) -> Square {
    events
        .iter()
        .find_map(|e| match e {
            Event::Moved { piece: id, to, .. } if *id == piece.id => Some(*to),
            _ => None,
        })
        .unwrap_or(mv.to)
}

/// Notation of a simple move.
///
/// * `before` is the position the move is played from, `after` the one it produced
///   (so check is read from `after`), `events` what `make_move` reported;
/// * `mate` says the move ended the game by checkmate.
///
/// A move that cannot be read (no piece on its origin) falls back to `e2e4`.
pub fn move_notation(
    before: &Position,
    mv: Move,
    events: &[Event],
    after: &Position,
    mate: bool,
) -> String {
    let Some(piece) = before.piece_at(mv.from) else {
        return format!("{}{}", square_name(mv.from), square_name(mv.to));
    };
    let dest = landing(mv, piece, events);
    let suffix = if mate {
        "#"
    } else if after.in_check(after.side) {
        "+"
    } else {
        ""
    };

    if piece.kind == PieceKind::King
        && events.iter().any(|e| matches!(e, Event::Castled { .. }))
        && file_of(mv.from).abs_diff(file_of(mv.to)) == 2
    {
        let castle = if file_of(mv.to) > file_of(mv.from) {
            "O-O"
        } else {
            "O-O-O"
        };
        return format!("{castle}{suffix}");
    }

    let capture = events
        .iter()
        .any(|e| matches!(e, Event::Captured { .. } | Event::Saved { .. }))
        || before
            .piece_at(dest)
            .is_some_and(|p| p.color != piece.color)
        // A pawn only changes file when it captures (en passant included).
        || (piece.kind == PieceKind::Pawn && file_of(mv.from) != file_of(dest));

    let mut text = String::new();
    if piece.kind == PieceKind::Pawn {
        if capture {
            text.push((b'a' + file_of(mv.from)) as char);
        }
    } else {
        text.push_str(piece_letter(piece.kind));
        text.push_str(&disambiguation(before, mv, piece));
    }
    if capture {
        text.push('x');
    }
    text.push_str(&square_name(dest));
    if let Some(Event::Promoted { to, .. }) =
        events.iter().find(|e| matches!(e, Event::Promoted { .. }))
    {
        text.push('=');
        text.push_str(piece_letter(*to));
    }
    text.push_str(suffix);
    text
}

/// The file, rank or both needed to tell `mv` from the other moves of a piece
/// of the same type to the same square.
fn disambiguation(before: &Position, mv: Move, piece: Piece) -> String {
    let rivals: Vec<Square> = before
        .legal_moves()
        .into_iter()
        .filter(|m| m.to == mv.to && m.from != mv.from)
        .filter(|m| {
            before
                .piece_at(m.from)
                .is_some_and(|p| p.kind == piece.kind && p.color == piece.color)
        })
        .map(|m| m.from)
        .collect();
    if rivals.is_empty() {
        return String::new();
    }
    let same_file = rivals.iter().any(|&s| file_of(s) == file_of(mv.from));
    let same_rank = rivals.iter().any(|&s| rank_of(s) == rank_of(mv.from));
    let file = ((b'a' + file_of(mv.from)) as char).to_string();
    let rank = (rank_of(mv.from) + 1).to_string();
    match (same_file, same_rank) {
        (false, _) => file,
        (true, false) => rank,
        (true, true) => format!("{file}{rank}"),
    }
}

/// Notation of the best move in `pos`, simulated: returns it with the position it leads to.
pub fn simulated_move_notation(pos: &Position, mv: Move) -> String {
    let mut next = pos.clone();
    let mut events = Vec::new();
    next.make_move(mv, &mut events);
    let mate = next.in_check(next.side) && next.legal_moves().is_empty();
    move_notation(pos, mv, &events, &next, mate)
}

/// Notation of any action, simulated from `pos` (a skill that is refused
/// falls back to its plain description).
pub fn simulated_action_notation(pos: &Position, action: Action) -> String {
    match action {
        Action::Move { from, to, promo } => simulated_move_notation(pos, Move { from, to, promo }),
        Action::Skill { skill, target } => skill_notation(skill, target),
    }
}
