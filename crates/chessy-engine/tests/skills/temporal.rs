use crate::common::*;

#[test]
fn a_piece_repeats_its_last_move() {
    let mut g = start(&[SkillId::Temporal], &[]);
    assert!(!has_skill(&g, SkillId::Temporal), "nothing has moved yet");
    mv(&mut g, "e2", "e4");
    mv(&mut g, "a7", "a6");
    assert!(can_skill(&g, SkillId::Temporal, piece("e4")));
    let ev = use_skill(&mut g, SkillId::Temporal, piece("e4"));
    assert_eq!(kind_at(&g, "e6"), Some((Color::White, PieceKind::Pawn)));
    assert!(ev.iter().any(|e| matches!(
        e,
        Event::Moved { from, to, .. } if *from == s("e4") && *to == s("e6")
    )));
    assert_eq!(g.side_to_move(), Color::Black, "it replaces the move");
}

#[test]
fn it_can_take_an_enemy_piece_which_goes_to_the_graveyard() {
    let mut g = game("4k3/p7/8/8/8/8/8/R3K3 w - - 0 1", &[SkillId::Temporal], &[]);
    mv(&mut g, "a1", "a4");
    mv(&mut g, "e8", "d8");
    let ev = use_skill(&mut g, SkillId::Temporal, piece("a4"));
    assert_eq!(kind_at(&g, "a7"), Some((Color::White, PieceKind::Rook)));
    assert!(ev.iter().any(|e| matches!(e, Event::Captured { .. })));
    assert_eq!(g.pos.captured_pawns, [0, 1]);
}

#[test]
fn needs_a_last_move_and_a_free_or_capturable_arrival_square() {
    // Teleported or cloned pieces have no last move.
    let g = game("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", &[SkillId::Temporal], &[]);
    assert!(!has_skill(&g, SkillId::Temporal));
    // An own piece in the way.
    let mut g = game("4k3/8/8/P7/8/8/8/R3K3 w - - 0 1", &[SkillId::Temporal], &[]);
    mv(&mut g, "a1", "a3");
    mv(&mut g, "e8", "d8");
    assert!(!has_skill(&g, SkillId::Temporal));
    // Off the board.
    let mut g = game("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", &[SkillId::Temporal], &[]);
    mv(&mut g, "a1", "a8");
    mv(&mut g, "e8", "d7");
    assert!(!has_skill(&g, SkillId::Temporal));
}

#[test]
fn never_the_king_and_never_an_immune_victim() {
    let mut g = game("4k3/8/8/8/8/8/8/4K3 w - - 0 1", &[SkillId::Temporal], &[]);
    mv(&mut g, "e1", "e2");
    mv(&mut g, "e8", "e7");
    assert!(!has_skill(&g, SkillId::Temporal));

    let mut g = game("4k3/p7/8/8/8/8/8/R3K3 w - - 0 1", &[SkillId::Temporal], &[]);
    mv(&mut g, "a1", "a4");
    let pawn = at(&g, "a7").unwrap().id;
    g.pos
        .effects
        .push(ActiveEffect::new(EffectKind::Immune, pawn, 100));
    mv(&mut g, "e8", "d8");
    assert!(!has_skill(&g, SkillId::Temporal));
}

#[test]
fn a_force_field_still_pushes_the_capturer() {
    let mut g = game(
        "4k3/p7/8/8/8/8/8/R3K3 w - - 0 1",
        &[SkillId::Temporal],
        &[SkillId::Forcefield],
    );
    mv(&mut g, "a1", "a4");
    use_skill(&mut g, SkillId::Forcefield, piece("a7"));
    let ev = use_skill(&mut g, SkillId::Temporal, piece("a4"));
    assert!(ev.iter().any(|e| matches!(
        e,
        Event::Pushed { from, to, .. } if *from == s("a7") && *to == s("a5")
    )));
    assert_eq!(kind_at(&g, "a5"), Some((Color::White, PieceKind::Rook)));
}

#[test]
fn counts_as_a_real_move_for_the_next_replay() {
    let mut g = game(
        "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
        &[SkillId::Temporal, SkillId::Temporal],
        &[],
    );
    mv(&mut g, "a1", "a2");
    mv(&mut g, "e8", "d8");
    use_skill(&mut g, SkillId::Temporal, piece("a2"));
    assert_eq!(kind_at(&g, "a3"), Some((Color::White, PieceKind::Rook)));
    mv(&mut g, "d8", "e8");
    assert!(can_skill(&g, SkillId::Temporal, piece("a3")));
}
