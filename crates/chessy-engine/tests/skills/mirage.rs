use crate::common::*;

#[test]
fn summons_a_flagged_piece_on_an_empty_square() {
    let mut g = game(KINGS, &[SkillId::Mirage], &[]);
    let targets = targets_of(&g, SkillId::Mirage);
    assert_eq!(targets.len(), 62 * 4, "every empty square, four types");
    assert!(targets
        .iter()
        .all(|t| matches!(t, SkillTarget::Spawn { kind, .. } if *kind != PieceKind::Pawn && *kind != PieceKind::King)));

    let ev = use_skill(&mut g, SkillId::Mirage, spawn("e4", PieceKind::Queen));
    let p = at(&g, "e4").unwrap();
    assert_eq!(
        (p.color, p.kind, p.mirage),
        (Color::White, PieceKind::Queen, true)
    );
    assert!(ev
        .iter()
        .any(|e| matches!(e, Event::Spawned { square, .. } if *square == s("e4"))));
    assert_eq!(g.side_to_move(), Color::Black);
}

#[test]
fn refuses_occupied_squares_and_pawns() {
    let mut g = game(KINGS, &[SkillId::Mirage], &[]);
    assert!(skill_fails(
        &mut g,
        SkillId::Mirage,
        spawn("e1", PieceKind::Rook)
    ));
    assert!(skill_fails(
        &mut g,
        SkillId::Mirage,
        spawn("e8", PieceKind::Rook)
    ));
    assert!(skill_fails(
        &mut g,
        SkillId::Mirage,
        spawn("e4", PieceKind::Pawn)
    ));
    assert!(skill_fails(
        &mut g,
        SkillId::Mirage,
        spawn("e4", PieceKind::King)
    ));
    assert!(g.pos.piece_at(s("e4")).is_none());
}

#[test]
fn never_captures() {
    let mut g = game("4k3/8/8/8/8/p7/8/4K3 w - - 0 1", &[SkillId::Mirage], &[]);
    use_skill(&mut g, SkillId::Mirage, spawn("a1", PieceKind::Rook));
    mv(&mut g, "e8", "d8");
    let moves = moves_from(&g, "a1");
    assert!(moves.contains(&"a2".to_string()));
    assert!(
        !moves.contains(&"a3".to_string()),
        "the pawn is not taken: {moves:?}"
    );
    assert!(moves.contains(&"d1".to_string()));
    assert!(!moves.contains(&"e1".to_string()), "own king");
}

#[test]
fn attacks_nothing_and_gives_no_check() {
    let mut g = game(KINGS, &[SkillId::Mirage], &[]);
    use_skill(&mut g, SkillId::Mirage, spawn("e4", PieceKind::Queen));
    assert!(!g.pos.in_check(Color::Black));
    assert!(!g.pos.is_attacked(s("e8"), Color::White));
    assert!(!g.pos.is_attacked(s("e5"), Color::White));
}

#[test]
fn disappears_when_taken_and_is_not_a_loss_of_a_pawn() {
    let mut g = game("r3k3/8/8/8/8/8/8/4K3 w - - 0 1", &[SkillId::Mirage], &[]);
    use_skill(&mut g, SkillId::Mirage, spawn("a4", PieceKind::Knight));
    assert!(can_move(&g, "a8", "a4"));
    let moves = moves_from(&g, "a8");
    assert!(
        !moves.contains(&"a3".to_string()),
        "it still blocks the file"
    );
    let ev = mv(&mut g, "a8", "a4");
    let captured = ev
        .iter()
        .find_map(|e| match e {
            Event::Captured { piece, .. } => Some(*piece),
            _ => None,
        })
        .expect("a capture is reported");
    assert!(captured.mirage);
    assert_eq!(count_pieces(&g, Color::White), 1, "only the king remains");
    assert_eq!(g.pos.captured_pawns, [0, 0]);
}

#[test]
fn can_block_a_check_for_one_move() {
    let g = game("4r1k1/8/8/8/8/8/8/4K3 w - - 0 1", &[SkillId::Mirage], &[]);
    assert!(can_skill(
        &g,
        SkillId::Mirage,
        spawn("e4", PieceKind::Knight)
    ));
    assert!(!can_skill(
        &g,
        SkillId::Mirage,
        spawn("a4", PieceKind::Knight)
    ));
}

#[test]
fn cannot_be_put_on_a_trapped_square() {
    let mut pos = Position::from_fen(KINGS).unwrap();
    pos.traps.push(Trap {
        square: s("e4"),
        owner: Color::Black,
    });
    let g = Game::from_position(pos, &[SkillId::Mirage], &[]);
    assert!(!can_skill(
        &g,
        SkillId::Mirage,
        spawn("e4", PieceKind::Rook)
    ));
    assert!(can_skill(&g, SkillId::Mirage, spawn("e5", PieceKind::Rook)));
}

#[test]
fn a_mirage_rook_is_no_castling_partner() {
    let mut g = game("4k3/8/8/8/8/8/8/4K3 w K - 0 1", &[SkillId::Mirage], &[]);
    use_skill(&mut g, SkillId::Mirage, spawn("h1", PieceKind::Rook));
    mv(&mut g, "e8", "d8");
    assert!(!can_move(&g, "e1", "g1"));
}

#[test]
fn is_unique() {
    assert_eq!(SkillId::Mirage.kind(), SkillKind::Unique);
}
