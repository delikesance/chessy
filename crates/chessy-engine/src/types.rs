use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::skills::{SkillId, SkillTarget};

/// Board square index: `a1 = 0`, `b1 = 1`, ..., `h8 = 63` (`rank * 8 + file`).
pub type Square = u8;
/// Stable identity of a piece for the whole game, so effects can follow it.
pub type PieceId = u16;

pub fn sq(file: u8, rank: u8) -> Square {
    rank * 8 + file
}

pub fn file_of(s: Square) -> u8 {
    s % 8
}

pub fn rank_of(s: Square) -> u8 {
    s / 8
}

pub fn square_name(s: Square) -> String {
    format!("{}{}", (b'a' + file_of(s)) as char, rank_of(s) + 1)
}

pub fn parse_square(name: &str) -> Option<Square> {
    let b = name.as_bytes();
    if b.len() != 2 || !(b'a'..=b'h').contains(&b[0]) || !(b'1'..=b'8').contains(&b[1]) {
        return None;
    }
    Some(sq(b[0] - b'a', b[1] - b'1'))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Color {
    White,
    Black,
}

impl Color {
    pub const BOTH: [Color; 2] = [Color::White, Color::Black];

    pub fn opposite(self) -> Color {
        match self {
            Color::White => Color::Black,
            Color::Black => Color::White,
        }
    }

    pub fn index(self) -> usize {
        match self {
            Color::White => 0,
            Color::Black => 1,
        }
    }

    /// Rank direction pawns of this color advance in.
    pub fn forward(self) -> i8 {
        match self {
            Color::White => 1,
            Color::Black => -1,
        }
    }

    pub fn home_rank(self) -> u8 {
        match self {
            Color::White => 0,
            Color::Black => 7,
        }
    }

    pub fn pawn_start_rank(self) -> u8 {
        match self {
            Color::White => 1,
            Color::Black => 6,
        }
    }

    pub fn promotion_rank(self) -> u8 {
        self.opposite().home_rank()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PieceKind {
    Pawn,
    Knight,
    Bishop,
    Rook,
    Queen,
    King,
}

impl PieceKind {
    pub const PROMOTIONS: [PieceKind; 4] = [
        PieceKind::Queen,
        PieceKind::Rook,
        PieceKind::Bishop,
        PieceKind::Knight,
    ];

    pub fn from_fen_char(c: char) -> Option<(Color, PieceKind)> {
        let color = if c.is_ascii_uppercase() {
            Color::White
        } else {
            Color::Black
        };
        let kind = match c.to_ascii_lowercase() {
            'p' => PieceKind::Pawn,
            'n' => PieceKind::Knight,
            'b' => PieceKind::Bishop,
            'r' => PieceKind::Rook,
            'q' => PieceKind::Queen,
            'k' => PieceKind::King,
            _ => return None,
        };
        Some((color, kind))
    }

    pub fn fen_char(self, color: Color) -> char {
        let c = match self {
            PieceKind::Pawn => 'p',
            PieceKind::Knight => 'n',
            PieceKind::Bishop => 'b',
            PieceKind::Rook => 'r',
            PieceKind::Queen => 'q',
            PieceKind::King => 'k',
        };
        match color {
            Color::White => c.to_ascii_uppercase(),
            Color::Black => c,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Piece {
    pub id: PieceId,
    pub kind: PieceKind,
    pub color: Color,
    /// Square this piece last reached by a real move (used by Rollback).
    #[serde(skip)]
    pub prev: Option<Square>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Move {
    pub from: Square,
    pub to: Square,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub promo: Option<PieceKind>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectKind {
    /// The piece cannot be captured.
    Immune,
    /// The piece cannot move (and therefore gives no check).
    Frozen,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActiveEffect {
    pub kind: EffectKind,
    pub piece: PieceId,
    /// The effect is active while `Position::ply < expires_at`.
    pub expires_at: u32,
}

/// Something a player can do with their turn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    Move {
        from: Square,
        to: Square,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        promo: Option<PieceKind>,
    },
    Skill {
        skill: SkillId,
        target: SkillTarget,
    },
}

impl From<Move> for Action {
    fn from(m: Move) -> Self {
        Action::Move {
            from: m.from,
            to: m.to,
            promo: m.promo,
        }
    }
}

/// Facts about what happened, for clients to animate.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    Moved {
        from: Square,
        to: Square,
        piece: PieceId,
    },
    Captured {
        square: Square,
        piece: Piece,
    },
    Promoted {
        square: Square,
        to: PieceKind,
    },
    Castled {
        rook_from: Square,
        rook_to: Square,
    },
    SkillUsed {
        color: Color,
        skill: SkillId,
        target: SkillTarget,
    },
    Teleported {
        from: Square,
        to: Square,
    },
    Cloned {
        from: Square,
        to: Square,
        piece: Piece,
    },
    Swapped {
        a: Square,
        b: Square,
    },
    Removed {
        square: Square,
        piece: Piece,
    },
    RolledBack {
        from: Square,
        to: Square,
    },
    EffectAdded {
        piece: PieceId,
        effect: EffectKind,
        expires_at: u32,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Outcome {
    Ongoing,
    Checkmate { winner: Color },
    Resignation { winner: Color },
    Stalemate,
    FiftyMoves,
    Repetition,
    InsufficientMaterial,
}

impl Outcome {
    pub fn is_over(&self) -> bool {
        !matches!(self, Outcome::Ongoing)
    }

    pub fn winner(&self) -> Option<Color> {
        match self {
            Outcome::Checkmate { winner } | Outcome::Resignation { winner } => Some(*winner),
            _ => None,
        }
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum RuleError {
    #[error("the game is over")]
    GameOver,
    #[error("illegal action")]
    IllegalAction,
    #[error("invalid FEN: {0}")]
    InvalidFen(String),
}
