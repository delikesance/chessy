use crate::common::*;

#[test]
fn the_piece_leaves_the_board_and_is_back_for_its_owners_next_turn() {
    let mut g = game("4k3/8/8/8/8/8/4N3/4K3 w - - 0 1", &[SkillId::Bench], &[]);
    let id = at(&g, "e2").unwrap().id;
    let ev = use_skill(&mut g, SkillId::Bench, piece("e2"));
    assert!(at(&g, "e2").is_none());
    assert_eq!(g.pos.benched.len(), 1);
    assert_eq!(g.pos.benched[0].piece.id, id);
    assert!(ev
        .iter()
        .any(|e| matches!(e, Event::Benched { square, .. } if *square == s("e2"))));

    let ev = mv(&mut g, "e8", "d8");
    assert_eq!(kind_at(&g, "e2"), Some((Color::White, PieceKind::Knight)));
    assert_eq!(at(&g, "e2").unwrap().id, id);
    assert!(g.pos.benched.is_empty());
    assert!(ev
        .iter()
        .any(|e| matches!(e, Event::Unbenched { square, .. } if *square == s("e2"))));
}

#[test]
fn comes_back_on_the_nearest_free_square_when_its_own_is_taken() {
    let mut g = game("4k3/6b1/8/8/8/2N5/8/4K3 w - - 0 1", &[SkillId::Bench], &[]);
    use_skill(&mut g, SkillId::Bench, piece("c3"));
    // Black's bishop takes the knight's square while it is away.
    let ev = mv(&mut g, "g7", "c3");
    assert_eq!(kind_at(&g, "c3"), Some((Color::Black, PieceKind::Bishop)));
    // Nearest free squares by king distance, then square order: b2.
    assert_eq!(kind_at(&g, "b2"), Some((Color::White, PieceKind::Knight)));
    assert!(ev
        .iter()
        .any(|e| matches!(e, Event::Unbenched { square, .. } if *square == s("b2"))));
}

#[test]
fn the_return_square_is_never_trapped() {
    let mut pos = Position::from_fen("4k3/8/8/8/8/2N5/8/4K3 w - - 0 1").unwrap();
    pos.traps.push(Trap {
        square: s("c3"),
        owner: Color::Black,
    });
    let mut g = Game::from_position(pos, &[SkillId::Bench], &[]);
    use_skill(&mut g, SkillId::Bench, piece("c3"));
    mv(&mut g, "e8", "d8");
    assert!(at(&g, "c3").is_none());
    assert_eq!(kind_at(&g, "b2"), Some((Color::White, PieceKind::Knight)));
}

#[test]
fn refused_when_it_would_expose_the_king() {
    let g = game("4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1", &[SkillId::Bench], &[]);
    assert!(
        !has_skill(&g, SkillId::Bench),
        "the knight shields the king"
    );
}

#[test]
fn never_the_king() {
    let g = game(KINGS, &[SkillId::Bench], &[]);
    assert!(!has_skill(&g, SkillId::Bench));
}

#[test]
fn a_benched_piece_still_counts_as_material() {
    let mut g = game("4k3/8/8/8/8/8/4R3/4K3 w - - 0 1", &[SkillId::Bench], &[]);
    use_skill(&mut g, SkillId::Bench, piece("e2"));
    assert_eq!(g.outcome(), Outcome::Ongoing, "not a bare-kings draw");
    mv(&mut g, "e8", "d8");
    assert_eq!(count_pieces(&g, Color::White), 2);
}
