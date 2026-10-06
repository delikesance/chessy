use crate::common::*;

/// The square and type of the piece `Godhelp` conjures in `g`.
fn conjure(g: &mut Game) -> (Square, Piece) {
    let ev = use_skill(g, SkillId::Godhelp, none());
    ev.iter()
        .find_map(|e| match e {
            Event::Spawned { square, piece } => Some((*square, *piece)),
            _ => None,
        })
        .expect("a piece appeared")
}

#[test]
fn a_temporary_piece_appears_on_the_middle_ranks() {
    let mut g = game(KINGS, &[SkillId::Godhelp], &[]);
    let (square, piece) = conjure(&mut g);
    assert!(
        (2..=5).contains(&rank_of(square)),
        "rank {}",
        rank_of(square)
    );
    assert_eq!(piece.color, Color::White);
    assert!(piece.temp);
    assert!(matches!(
        piece.kind,
        PieceKind::Knight | PieceKind::Bishop | PieceKind::Rook | PieceKind::Queen
    ));
    assert_eq!(g.pos.piece_at(square), Some(piece));
    assert!(g.pos.has_effect(piece.id, EffectKind::Vanish));
    assert_eq!(g.side_to_move(), Color::Black);
}

#[test]
fn the_choice_depends_only_on_the_position() {
    let mut a = game(KINGS, &[SkillId::Godhelp], &[]);
    let mut b = game(KINGS, &[SkillId::Godhelp], &[]);
    assert_eq!(conjure(&mut a), conjure(&mut b));

    // Another position gives (usually) another piece, but always the same one for itself.
    let mut c = start(&[SkillId::Godhelp], &[]);
    let mut d = start(&[SkillId::Godhelp], &[]);
    assert_eq!(conjure(&mut c), conjure(&mut d));
    let mut seen = std::collections::HashSet::new();
    for fen in [
        KINGS,
        "4k3/8/8/8/8/8/P7/4K3 w - - 0 1",
        "4k3/p7/8/8/8/8/8/4K3 w - - 0 1",
        "3k4/8/8/8/8/8/8/3K4 w - - 0 1",
        "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
        "7k/8/8/8/8/8/8/R3K3 w - - 0 1",
    ] {
        let mut g = game(fen, &[SkillId::Godhelp], &[]);
        seen.insert(conjure(&mut g).0);
    }
    assert!(
        seen.len() > 1,
        "the choice varies with the position: {seen:?}"
    );
}

#[test]
fn serves_three_turns_then_disappears() {
    let mut g = game("r6k/8/8/8/8/8/8/4K3 w - - 0 1", &[SkillId::Godhelp], &[]);
    let (square, piece) = conjure(&mut g);
    for turn in 0..3 {
        assert!(
            g.pos.piece_at(square).is_some() || turn > 0,
            "present at the start"
        );
        // Black plays any move that does not touch the new piece.
        let black = g
            .legal_actions()
            .into_iter()
            .find(|a| matches!(a, Action::Move { to, .. } if *to != square))
            .expect("black can move");
        g.apply(black).unwrap();
        assert!(
            g.pos.effects.iter().any(|e| e.piece == piece.id),
            "turn {turn}"
        );
        // White plays any move that is not the new piece's.
        let white = g
            .legal_actions()
            .into_iter()
            .find(|a| matches!(a, Action::Move { from, .. } if *from != square))
            .expect("white can move");
        g.apply(white).unwrap();
    }
    assert_eq!(g.pos.ply, 7);
    assert!(
        !g.pos.board.iter().flatten().any(|p| p.id == piece.id),
        "the piece is gone after white's third turn"
    );
    assert!(g.pos.effects.is_empty());
}

#[test]
fn a_temporary_piece_is_not_a_lost_piece() {
    // Whatever it is, taking it adds nothing to the graveyard (it is not a pawn anyway) and
    // the capture simply removes it.
    let mut g = game("r6k/8/8/8/8/8/8/4K3 w - - 0 1", &[SkillId::Godhelp], &[]);
    let (square, piece) = conjure(&mut g);
    let capture = g
        .legal_actions()
        .into_iter()
        .find(|a| matches!(a, Action::Move { to, .. } if *to == square));
    if let Some(capture) = capture {
        g.apply(capture).unwrap();
        assert!(!g
            .pos
            .board
            .iter()
            .flatten()
            .any(|p| p.id == piece.id && p.color == Color::White));
        assert!(!g.pos.effects.iter().any(|e| e.piece == piece.id));
    }
}

#[test]
fn unavailable_when_no_square_is_free() {
    let g = game("4k3/8/8/8/8/8/8/4K3 w - - 0 1", &[SkillId::Godhelp], &[]);
    assert!(has_skill(&g, SkillId::Godhelp));
    // Fill ranks 3 to 6 completely.
    let g = game(
        "4k3/8/pppppppp/pppppppp/pppppppp/pppppppp/8/4K3 w - - 0 1",
        &[SkillId::Godhelp],
        &[],
    );
    assert!(!has_skill(&g, SkillId::Godhelp));
}
