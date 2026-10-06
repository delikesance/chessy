use crate::types::*;

pub const START_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

pub const WHITE_KING_SIDE: u8 = 1;
pub const WHITE_QUEEN_SIDE: u8 = 2;
pub const BLACK_KING_SIDE: u8 = 4;
pub const BLACK_QUEEN_SIDE: u8 = 8;

const KNIGHT_DELTAS: [(i8, i8); 8] = [
    (1, 2),
    (2, 1),
    (2, -1),
    (1, -2),
    (-1, -2),
    (-2, -1),
    (-2, 1),
    (-1, 2),
];
const KING_DELTAS: [(i8, i8); 8] = [
    (1, 0),
    (1, 1),
    (0, 1),
    (-1, 1),
    (-1, 0),
    (-1, -1),
    (0, -1),
    (1, -1),
];
const DIAGONALS: [(i8, i8); 4] = [(1, 1), (1, -1), (-1, 1), (-1, -1)];
const ORTHOGONALS: [(i8, i8); 4] = [(1, 0), (-1, 0), (0, 1), (0, -1)];

pub fn offset(s: Square, df: i8, dr: i8) -> Option<Square> {
    let f = file_of(s) as i8 + df;
    let r = rank_of(s) as i8 + dr;
    if (0..8).contains(&f) && (0..8).contains(&r) {
        Some(sq(f as u8, r as u8))
    } else {
        None
    }
}

/// Everything needed to play from a given moment: cheap to clone, so legality
/// checks and perft can simulate moves on copies.
#[derive(Clone, Debug)]
pub struct Position {
    pub board: [Option<Piece>; 64],
    pub side: Color,
    pub castling: u8,
    pub en_passant: Option<Square>,
    pub halfmove: u32,
    pub fullmove: u32,
    /// Number of actions (moves or skills) played so far; drives effect expiry.
    pub ply: u32,
    pub effects: Vec<ActiveEffect>,
    next_id: PieceId,
}

impl Position {
    pub fn empty() -> Self {
        Position {
            board: [None; 64],
            side: Color::White,
            castling: 0,
            en_passant: None,
            halfmove: 0,
            fullmove: 1,
            ply: 0,
            effects: Vec::new(),
            next_id: 0,
        }
    }

    pub fn startpos() -> Self {
        Self::from_fen(START_FEN).expect("start FEN is valid")
    }

    pub fn from_fen(fen: &str) -> Result<Self, RuleError> {
        let bad = |msg: &str| RuleError::InvalidFen(msg.to_string());
        let mut parts = fen.split_whitespace();
        let placement = parts.next().ok_or_else(|| bad("missing placement"))?;
        let side = parts.next().ok_or_else(|| bad("missing side to move"))?;
        let castling = parts.next().unwrap_or("-");
        let ep = parts.next().unwrap_or("-");
        let halfmove = parts.next().unwrap_or("0");
        let fullmove = parts.next().unwrap_or("1");

        let mut pos = Position::empty();
        let ranks: Vec<&str> = placement.split('/').collect();
        if ranks.len() != 8 {
            return Err(bad("placement must have 8 ranks"));
        }
        for (i, row) in ranks.iter().enumerate() {
            let rank = 7 - i as u8;
            let mut file = 0u8;
            for c in row.chars() {
                if let Some(n) = c.to_digit(10) {
                    file += n as u8;
                } else {
                    let (color, kind) =
                        PieceKind::from_fen_char(c).ok_or_else(|| bad("unknown piece"))?;
                    if file > 7 {
                        return Err(bad("rank overflows"));
                    }
                    let id = pos.alloc_id();
                    pos.board[sq(file, rank) as usize] = Some(Piece {
                        id,
                        kind,
                        color,
                        prev: None,
                    });
                    file += 1;
                }
            }
            if file != 8 {
                return Err(bad("rank does not have 8 files"));
            }
        }
        pos.side = match side {
            "w" => Color::White,
            "b" => Color::Black,
            _ => return Err(bad("side to move must be w or b")),
        };
        for c in castling.chars() {
            pos.castling |= match c {
                'K' => WHITE_KING_SIDE,
                'Q' => WHITE_QUEEN_SIDE,
                'k' => BLACK_KING_SIDE,
                'q' => BLACK_QUEEN_SIDE,
                '-' => 0,
                _ => return Err(bad("bad castling field")),
            };
        }
        pos.en_passant = if ep == "-" {
            None
        } else {
            Some(parse_square(ep).ok_or_else(|| bad("bad en passant square"))?)
        };
        pos.halfmove = halfmove.parse().map_err(|_| bad("bad halfmove clock"))?;
        pos.fullmove = fullmove.parse().map_err(|_| bad("bad fullmove number"))?;
        Ok(pos)
    }

    pub fn to_fen(&self) -> String {
        let mut out = String::new();
        for rank in (0..8).rev() {
            let mut empty = 0;
            for file in 0..8 {
                match self.board[sq(file, rank) as usize] {
                    None => empty += 1,
                    Some(p) => {
                        if empty > 0 {
                            out.push_str(&empty.to_string());
                            empty = 0;
                        }
                        out.push(p.kind.fen_char(p.color));
                    }
                }
            }
            if empty > 0 {
                out.push_str(&empty.to_string());
            }
            if rank > 0 {
                out.push('/');
            }
        }
        out.push(' ');
        out.push(if self.side == Color::White { 'w' } else { 'b' });
        out.push(' ');
        if self.castling == 0 {
            out.push('-');
        } else {
            for (bit, c) in [
                (WHITE_KING_SIDE, 'K'),
                (WHITE_QUEEN_SIDE, 'Q'),
                (BLACK_KING_SIDE, 'k'),
                (BLACK_QUEEN_SIDE, 'q'),
            ] {
                if self.castling & bit != 0 {
                    out.push(c);
                }
            }
        }
        out.push(' ');
        match self.en_passant {
            Some(s) => out.push_str(&square_name(s)),
            None => out.push('-'),
        }
        out.push_str(&format!(" {} {}", self.halfmove, self.fullmove));
        out
    }

    pub fn alloc_id(&mut self) -> PieceId {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub fn piece_at(&self, s: Square) -> Option<Piece> {
        self.board[s as usize]
    }

    pub fn pieces(&self, color: Color) -> impl Iterator<Item = (Square, Piece)> + '_ {
        self.board
            .iter()
            .enumerate()
            .filter_map(move |(i, p)| p.filter(|p| p.color == color).map(|p| (i as Square, p)))
    }

    pub fn has_effect(&self, id: PieceId, kind: EffectKind) -> bool {
        self.effects.iter().any(|e| e.piece == id && e.kind == kind)
    }

    pub fn is_frozen(&self, id: PieceId) -> bool {
        self.has_effect(id, EffectKind::Frozen)
    }

    pub fn is_immune(&self, id: PieceId) -> bool {
        self.has_effect(id, EffectKind::Immune)
    }

    pub fn add_effect(&mut self, kind: EffectKind, piece: PieceId, duration_plies: u32) -> Event {
        let expires_at = self.ply + duration_plies;
        self.effects.push(ActiveEffect {
            kind,
            piece,
            expires_at,
        });
        Event::EffectAdded {
            piece,
            effect: kind,
            expires_at,
        }
    }

    pub fn king_square(&self, color: Color) -> Option<Square> {
        self.pieces(color)
            .find(|(_, p)| p.kind == PieceKind::King)
            .map(|(s, _)| s)
    }

    /// Whether `target` is attacked by a piece of color `by`. Frozen pieces
    /// cannot move, so they attack nothing.
    pub fn is_attacked(&self, target: Square, by: Color) -> bool {
        let hits = |s: Square, kinds: &[PieceKind]| -> bool {
            matches!(self.board[s as usize], Some(p)
                if p.color == by && kinds.contains(&p.kind) && !self.is_frozen(p.id))
        };

        // Pawns attack diagonally forward, so they sit one rank "behind" the target.
        for df in [-1, 1] {
            if let Some(s) = offset(target, df, -by.forward()) {
                if hits(s, &[PieceKind::Pawn]) {
                    return true;
                }
            }
        }
        for (df, dr) in KNIGHT_DELTAS {
            if let Some(s) = offset(target, df, dr) {
                if hits(s, &[PieceKind::Knight]) {
                    return true;
                }
            }
        }
        for (df, dr) in KING_DELTAS {
            if let Some(s) = offset(target, df, dr) {
                if hits(s, &[PieceKind::King]) {
                    return true;
                }
            }
        }
        let rays: [(&[(i8, i8); 4], PieceKind); 2] = [
            (&DIAGONALS, PieceKind::Bishop),
            (&ORTHOGONALS, PieceKind::Rook),
        ];
        for (dirs, slider) in rays {
            for &(df, dr) in dirs {
                let mut cur = target;
                while let Some(next) = offset(cur, df, dr) {
                    cur = next;
                    if self.board[cur as usize].is_some() {
                        if hits(cur, &[slider, PieceKind::Queen]) {
                            return true;
                        }
                        break;
                    }
                }
            }
        }
        false
    }

    pub fn in_check(&self, color: Color) -> bool {
        self.king_square(color)
            .is_some_and(|k| self.is_attacked(k, color.opposite()))
    }

    /// Whether a piece of `color` may stand on `target` (pawns never rest on a
    /// back rank).
    pub fn can_stand(kind: PieceKind, target: Square) -> bool {
        kind != PieceKind::Pawn || !matches!(rank_of(target), 0 | 7)
    }

    fn can_capture(&self, mover: Color, target: Square) -> bool {
        match self.board[target as usize] {
            None => true,
            Some(p) => p.color != mover && !self.is_immune(p.id),
        }
    }

    pub fn pseudo_moves(&self, out: &mut Vec<Move>) {
        let color = self.side;
        for (from, piece) in self.pieces(color) {
            if self.is_frozen(piece.id) {
                continue;
            }
            match piece.kind {
                PieceKind::Pawn => self.pawn_moves(from, color, out),
                PieceKind::Knight => self.step_moves(from, color, &KNIGHT_DELTAS, out),
                PieceKind::King => {
                    self.step_moves(from, color, &KING_DELTAS, out);
                    self.castling_moves(from, color, out);
                }
                PieceKind::Bishop => self.slide_moves(from, color, &DIAGONALS, out),
                PieceKind::Rook => self.slide_moves(from, color, &ORTHOGONALS, out),
                PieceKind::Queen => {
                    self.slide_moves(from, color, &DIAGONALS, out);
                    self.slide_moves(from, color, &ORTHOGONALS, out);
                }
            }
        }
    }

    fn push_pawn_move(&self, from: Square, to: Square, color: Color, out: &mut Vec<Move>) {
        if rank_of(to) == color.promotion_rank() {
            for promo in PieceKind::PROMOTIONS {
                out.push(Move {
                    from,
                    to,
                    promo: Some(promo),
                });
            }
        } else {
            out.push(Move {
                from,
                to,
                promo: None,
            });
        }
    }

    fn pawn_moves(&self, from: Square, color: Color, out: &mut Vec<Move>) {
        let fwd = color.forward();
        if let Some(one) = offset(from, 0, fwd) {
            if self.board[one as usize].is_none() {
                self.push_pawn_move(from, one, color, out);
                if rank_of(from) == color.pawn_start_rank() {
                    if let Some(two) = offset(from, 0, 2 * fwd) {
                        if self.board[two as usize].is_none() {
                            out.push(Move {
                                from,
                                to: two,
                                promo: None,
                            });
                        }
                    }
                }
            }
        }
        for df in [-1, 1] {
            let Some(to) = offset(from, df, fwd) else {
                continue;
            };
            match self.board[to as usize] {
                Some(p) if p.color != color && !self.is_immune(p.id) => {
                    self.push_pawn_move(from, to, color, out)
                }
                None if self.en_passant == Some(to) => {
                    let victim = sq(file_of(to), rank_of(from));
                    if matches!(self.board[victim as usize], Some(p)
                        if p.color != color && p.kind == PieceKind::Pawn && !self.is_immune(p.id))
                    {
                        out.push(Move {
                            from,
                            to,
                            promo: None,
                        });
                    }
                }
                _ => {}
            }
        }
    }

    fn step_moves(&self, from: Square, color: Color, deltas: &[(i8, i8); 8], out: &mut Vec<Move>) {
        for &(df, dr) in deltas {
            if let Some(to) = offset(from, df, dr) {
                if self.can_capture(color, to) {
                    out.push(Move {
                        from,
                        to,
                        promo: None,
                    });
                }
            }
        }
    }

    fn slide_moves(&self, from: Square, color: Color, dirs: &[(i8, i8); 4], out: &mut Vec<Move>) {
        for &(df, dr) in dirs {
            let mut cur = from;
            while let Some(to) = offset(cur, df, dr) {
                cur = to;
                if self.board[to as usize].is_none() {
                    out.push(Move {
                        from,
                        to,
                        promo: None,
                    });
                } else {
                    if self.can_capture(color, to) {
                        out.push(Move {
                            from,
                            to,
                            promo: None,
                        });
                    }
                    break;
                }
            }
        }
    }

    fn castling_moves(&self, from: Square, color: Color, out: &mut Vec<Move>) {
        let rank = color.home_rank();
        if from != sq(4, rank) {
            return;
        }
        let (king_bit, queen_bit) = match color {
            Color::White => (WHITE_KING_SIDE, WHITE_QUEEN_SIDE),
            Color::Black => (BLACK_KING_SIDE, BLACK_QUEEN_SIDE),
        };
        let enemy = color.opposite();
        let rook_ready = |file: u8| {
            matches!(self.board[sq(file, rank) as usize], Some(p)
                if p.kind == PieceKind::Rook && p.color == color && !self.is_frozen(p.id))
        };
        let empty = |files: &[u8]| {
            files
                .iter()
                .all(|&f| self.board[sq(f, rank) as usize].is_none())
        };
        let safe = |files: &[u8]| files.iter().all(|&f| !self.is_attacked(sq(f, rank), enemy));

        if self.castling & king_bit != 0 && rook_ready(7) && empty(&[5, 6]) && safe(&[4, 5, 6]) {
            out.push(Move {
                from,
                to: sq(6, rank),
                promo: None,
            });
        }
        if self.castling & queen_bit != 0 && rook_ready(0) && empty(&[1, 2, 3]) && safe(&[4, 3, 2])
        {
            out.push(Move {
                from,
                to: sq(2, rank),
                promo: None,
            });
        }
    }

    pub fn legal_moves(&self) -> Vec<Move> {
        let mut pseudo = Vec::with_capacity(48);
        self.pseudo_moves(&mut pseudo);
        let color = self.side;
        let mut sink = Vec::new();
        pseudo
            .into_iter()
            .filter(|&mv| {
                let mut next = self.clone();
                sink.clear();
                next.make_move(mv, &mut sink);
                !next.in_check(color)
            })
            .collect()
    }

    /// Plays `mv` without checking legality; callers go through `legal_moves`.
    pub fn make_move(&mut self, mv: Move, ev: &mut Vec<Event>) {
        let color = self.side;
        let mut piece = self.board[mv.from as usize]
            .take()
            .expect("move from an occupied square");
        let mut captured = self.board[mv.to as usize].take();
        let mut new_ep = None;

        if piece.kind == PieceKind::Pawn {
            if Some(mv.to) == self.en_passant
                && file_of(mv.from) != file_of(mv.to)
                && captured.is_none()
            {
                let victim = sq(file_of(mv.to), rank_of(mv.from));
                captured = self.board[victim as usize].take();
                if let Some(p) = captured {
                    ev.push(Event::Captured {
                        square: victim,
                        piece: p,
                    });
                }
                captured = None; // already reported
                self.halfmove = 0;
            }
            if rank_of(mv.from).abs_diff(rank_of(mv.to)) == 2 {
                new_ep = Some((mv.from + mv.to) / 2);
            }
        }

        if let Some(p) = captured {
            ev.push(Event::Captured {
                square: mv.to,
                piece: p,
            });
        }

        if piece.kind == PieceKind::King && file_of(mv.from).abs_diff(file_of(mv.to)) == 2 {
            let rank = rank_of(mv.from);
            let (rook_from, rook_to) = if file_of(mv.to) == 6 {
                (sq(7, rank), sq(5, rank))
            } else {
                (sq(0, rank), sq(3, rank))
            };
            let mut rook = self.board[rook_from as usize]
                .take()
                .expect("castling rook present");
            rook.prev = None;
            self.board[rook_to as usize] = Some(rook);
            ev.push(Event::Castled { rook_from, rook_to });
        }

        // Castling rights: lost when a king or rook leaves, or a rook is captured.
        if piece.kind == PieceKind::King {
            self.castling &= match color {
                Color::White => !(WHITE_KING_SIDE | WHITE_QUEEN_SIDE),
                Color::Black => !(BLACK_KING_SIDE | BLACK_QUEEN_SIDE),
            };
        }
        for s in [mv.from, mv.to] {
            self.castling &= match s {
                0 => !WHITE_QUEEN_SIDE,
                7 => !WHITE_KING_SIDE,
                56 => !BLACK_QUEEN_SIDE,
                63 => !BLACK_KING_SIDE,
                _ => 0xF,
            };
        }

        if piece.kind == PieceKind::Pawn || captured.is_some() {
            self.halfmove = 0;
        } else {
            self.halfmove += 1;
        }

        ev.push(Event::Moved {
            from: mv.from,
            to: mv.to,
            piece: piece.id,
        });

        if piece.kind == PieceKind::Pawn && rank_of(mv.to) == color.promotion_rank() {
            let kind = mv.promo.unwrap_or(PieceKind::Queen);
            piece.kind = kind;
            piece.prev = None;
            ev.push(Event::Promoted {
                square: mv.to,
                to: kind,
            });
        } else {
            piece.prev = Some(mv.from);
        }
        self.board[mv.to as usize] = Some(piece);
        self.en_passant = new_ep;
        self.end_turn();
    }

    /// Drops castling rights whose king or rook is no longer on its home square
    /// (skills can relocate pieces without going through `make_move`).
    pub fn sanitize_castling(&mut self) {
        let checks = [
            (WHITE_KING_SIDE, 4, 7, Color::White),
            (WHITE_QUEEN_SIDE, 4, 0, Color::White),
            (BLACK_KING_SIDE, 60, 63, Color::Black),
            (BLACK_QUEEN_SIDE, 60, 56, Color::Black),
        ];
        for (bit, king_sq, rook_sq, color) in checks {
            let king_ok = matches!(self.board[king_sq], Some(p)
                if p.kind == PieceKind::King && p.color == color);
            let rook_ok = matches!(self.board[rook_sq], Some(p)
                if p.kind == PieceKind::Rook && p.color == color);
            if !king_ok || !rook_ok {
                self.castling &= !bit;
            }
        }
    }

    /// Hands the turn over: advances the move counters and expires effects.
    pub fn end_turn(&mut self) {
        if self.side == Color::Black {
            self.fullmove += 1;
        }
        self.side = self.side.opposite();
        self.ply += 1;
        let ply = self.ply;
        self.effects.retain(|e| e.expires_at > ply);
    }

    /// Number of leaf nodes at `depth` plies of plain chess (no skills).
    pub fn perft(&self, depth: u32) -> u64 {
        if depth == 0 {
            return 1;
        }
        let moves = self.legal_moves();
        if depth == 1 {
            return moves.len() as u64;
        }
        let mut sink = Vec::new();
        moves
            .into_iter()
            .map(|mv| {
                let mut next = self.clone();
                sink.clear();
                next.make_move(mv, &mut sink);
                next.perft(depth - 1)
            })
            .sum()
    }
}
