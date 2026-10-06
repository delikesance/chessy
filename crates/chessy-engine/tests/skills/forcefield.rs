use crate::common::*;

fn pushed(ev: &[Event]) -> Option<(Square, Square)> {
    ev.iter().find_map(|e| match e {
        Event::Pushed { from, to, .. } => Some((*from, *to)),
        _ => None,
    })
}

#[test]
fn the_capturer_is_pushed_back_two_squares_and_the_piece_still_dies() {
    let mut g = game(
        "4r2k/8/8/8/4P3/8/8/4K3 w - - 0 1",
        &[SkillId::Forcefield],
        &[],
    );
    use_skill(&mut g, SkillId::Forcefield, piece("e4"));
    let ev = mv(&mut g, "e8", "e4");
    assert_eq!(pushed(&ev), Some((s("e4"), s("e6"))));
    assert_eq!(kind_at(&g, "e6"), Some((Color::Black, PieceKind::Rook)));
    assert!(at(&g, "e4").is_none(), "the pawn is captured");
    assert!(ev.iter().any(|e| matches!(e, Event::Captured { .. })));
    assert_eq!(g.pos.captured_pawns, [1, 0]);
    assert!(g.pos.effects.is_empty(), "the field went with the piece");
}

#[test]
fn stops_in_front_of_an_obstacle() {
    let mut g = game(
        "4k3/6p1/5b2/4P3/8/8/8/4K3 w - - 0 1",
        &[SkillId::Forcefield],
        &[],
    );
    use_skill(&mut g, SkillId::Forcefield, piece("e5"));
    let ev = mv(&mut g, "f6", "e5");
    // Pushed back towards f6, then g7 is occupied: one square only.
    assert_eq!(pushed(&ev), Some((s("e5"), s("f6"))));
    assert_eq!(kind_at(&g, "g7"), Some((Color::Black, PieceKind::Pawn)));
}

#[test]
fn stops_at_the_edge_of_the_board() {
    let mut g = game(
        "4k3/8/8/rP6/8/8/8/4K3 w - - 0 1",
        &[SkillId::Forcefield],
        &[],
    );
    use_skill(&mut g, SkillId::Forcefield, piece("b5"));
    let ev = mv(&mut g, "a5", "b5");
    assert_eq!(pushed(&ev), Some((s("b5"), s("a5"))));
}

#[test]
fn a_push_that_uncovers_a_check_makes_the_capture_illegal() {
    // Without the field, Bxg4 is fine: the bishop keeps the g-file closed.
    let fen = "6k1/8/8/5b2/6P1/8/8/4K1R1 w - - 0 1";
    let mut g = game(fen, &[SkillId::Forcefield], &[]);
    mv(&mut g, "e1", "d1");
    assert!(can_move(&g, "f5", "g4"));

    // With it, the bishop is pushed off the file and the rook checks.
    let mut g = game(fen, &[SkillId::Forcefield], &[]);
    use_skill(&mut g, SkillId::Forcefield, piece("g4"));
    assert!(!can_move(&g, "f5", "g4"));
}

#[test]
fn celestial_intervention_wins_over_a_force_field() {
    let mut g = game(
        "3rk3/8/8/8/3N4/8/8/4K3 w - - 0 1",
        &[SkillId::Celestial, SkillId::Forcefield],
        &[],
    );
    use_skill(&mut g, SkillId::Celestial, piece("d4"));
    mv(&mut g, "e8", "f8");
    use_skill(&mut g, SkillId::Forcefield, piece("d4"));
    let ev = mv(&mut g, "d8", "d4");
    assert!(
        pushed(&ev).is_none(),
        "nothing was captured, nobody is pushed"
    );
    assert!(ev.iter().any(|e| matches!(e, Event::Saved { .. })));
    assert_eq!(kind_at(&g, "d4"), Some((Color::Black, PieceKind::Rook)));
    let saved = at(&g, "c3").expect("the knight went home to the nearest free square");
    assert!(
        g.pos.has_effect(saved.id, EffectKind::Forcefield),
        "the field stays"
    );
    assert!(
        !g.pos.has_effect(saved.id, EffectKind::Celestial),
        "the intervention is used"
    );
}

#[test]
fn a_piece_without_a_field_is_taken_normally() {
    let mut g = game("4r2k/8/8/8/4P3/8/8/4K3 w - - 0 1", &[], &[]);
    mv(&mut g, "e1", "d1");
    let ev = mv(&mut g, "e8", "e4");
    assert!(pushed(&ev).is_none());
    assert_eq!(kind_at(&g, "e4"), Some((Color::Black, PieceKind::Rook)));
}

#[test]
fn works_on_en_passant_captures_too() {
    // The protected pawn makes a double step past the black pawn on d4, which takes it en passant.
    let mut g = game(
        "4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1",
        &[SkillId::Forcefield],
        &[],
    );
    use_skill(&mut g, SkillId::Forcefield, piece("e2"));
    mv(&mut g, "e8", "e7");
    mv(&mut g, "e2", "e4"); // double step: en passant on e3 is possible
    let ev = mv(&mut g, "d4", "e3");
    assert!(ev
        .iter()
        .any(|e| matches!(e, Event::Captured { square, .. } if *square == s("e4"))));
    // Pushed back from e3 towards d4 and beyond.
    assert_eq!(pushed(&ev), Some((s("e3"), s("c5"))));
}
