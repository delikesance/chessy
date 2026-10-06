use crate::common::*;

#[test]
fn copies_an_enemy_piece_onto_its_mirror_square_for_one_turn() {
    let mut g = game(
        "1n2k3/8/8/8/8/8/8/4K3 w - - 0 1",
        &[SkillId::Terminator],
        &[],
    );
    assert_eq!(targets_of(&g, SkillId::Terminator), vec![piece("b8")]);
    let ev = use_skill(&mut g, SkillId::Terminator, piece("b8"));
    let copy = at(&g, "b1").expect("the copy stands on the mirror square");
    assert_eq!(
        (copy.color, copy.kind, copy.temp),
        (Color::White, PieceKind::Knight, true)
    );
    assert!(
        kind_at(&g, "b8").is_some_and(|k| k.0 == Color::Black),
        "the original stays"
    );
    assert!(ev
        .iter()
        .any(|e| matches!(e, Event::Spawned { square, .. } if *square == s("b1"))));
    assert!(g.pos.has_effect(copy.id, EffectKind::Vanish));

    mv(&mut g, "e8", "d8");
    // It serves during white's next turn...
    assert!(can_move(&g, "b1", "c3"));
    // ... and is gone right after it, wherever it went.
    let ev = mv(&mut g, "b1", "c3");
    assert!(at(&g, "c3").is_none());
    assert!(ev.iter().any(|e| matches!(e, Event::Vanished { .. })));
    assert_eq!(count_pieces(&g, Color::White), 1);
}

#[test]
fn vanishes_even_if_unused() {
    let mut g = game(
        "1n2k3/8/8/8/8/8/8/4K3 w - - 0 1",
        &[SkillId::Terminator],
        &[],
    );
    use_skill(&mut g, SkillId::Terminator, piece("b8"));
    mv(&mut g, "e8", "d8");
    mv(&mut g, "e1", "e2");
    assert!(at(&g, "b1").is_none());
    assert!(g.pos.effects.is_empty());
}

#[test]
fn needs_a_free_mirror_square_and_never_copies_kings() {
    let g = game(
        "1n2k3/8/8/8/8/8/8/1N2K3 w - - 0 1",
        &[SkillId::Terminator],
        &[],
    );
    assert!(
        !has_skill(&g, SkillId::Terminator),
        "b1 is taken, the king is no target"
    );
}

#[test]
fn a_copied_pawn_is_not_a_lost_pawn() {
    let mut g = game(
        "4k3/3p4/8/8/8/8/7r/4K3 w - - 0 1",
        &[SkillId::Terminator],
        &[],
    );
    use_skill(&mut g, SkillId::Terminator, piece("d7"));
    assert_eq!(kind_at(&g, "d2"), Some((Color::White, PieceKind::Pawn)));
    mv(&mut g, "h2", "d2");
    assert_eq!(g.pos.captured_pawns, [0, 0]);
}

#[test]
fn the_copy_can_capture() {
    let mut g = game(
        "r3k3/8/8/8/8/p7/8/4K3 w - - 0 1",
        &[SkillId::Terminator],
        &[],
    );
    use_skill(&mut g, SkillId::Terminator, piece("a8"));
    mv(&mut g, "e8", "d8");
    assert!(can_move(&g, "a1", "a3"), "the copied rook takes the pawn");
}
