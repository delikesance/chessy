use crate::common::*;

#[test]
fn undoes_the_skill_just_used_which_stays_spent() {
    let mut g = start(&[SkillId::Canceller], &[SkillId::Teleportation]);
    mv(&mut g, "e2", "e4");
    let before = g.pos.board;
    use_skill(&mut g, SkillId::Teleportation, piece_to("g8", "h3"));
    assert_ne!(g.pos.board, before);
    assert!(can_skill(&g, SkillId::Canceller, none()));

    let ev = use_skill(&mut g, SkillId::Canceller, none());
    assert_eq!(g.pos.board, before, "the board is as it was");
    assert!(ev
        .iter()
        .any(|e| matches!(e, Event::Cancelled { skill } if *skill == SkillId::Teleportation)));
    assert!(slot(&g, Color::Black, SkillId::Teleportation).used);
    assert!(slot(&g, Color::White, SkillId::Canceller).used);
    assert_eq!(g.side_to_move(), Color::Black, "the turn passes");
    assert_eq!(g.pos.ply, 3);
}

#[test]
fn only_right_after_a_skill() {
    let mut g = start(&[SkillId::Canceller], &[SkillId::Teleportation]);
    assert!(!has_skill(&g, SkillId::Canceller), "nothing to cancel yet");
    mv(&mut g, "e2", "e4");
    mv(&mut g, "e7", "e5");
    assert!(
        !has_skill(&g, SkillId::Canceller),
        "their last action was a move"
    );

    let mut g = start(&[SkillId::Canceller], &[SkillId::Teleportation]);
    mv(&mut g, "e2", "e4");
    use_skill(&mut g, SkillId::Teleportation, piece_to("g8", "h3"));
    mv(&mut g, "d2", "d4");
    mv(&mut g, "a7", "a6");
    assert!(!has_skill(&g, SkillId::Canceller), "too late");
}

#[test]
fn cancels_a_freeze() {
    let mut g = start(&[SkillId::Canceller], &[SkillId::Freeze]);
    mv(&mut g, "e2", "e4");
    use_skill(&mut g, SkillId::Freeze, piece("e4"));
    assert!(effects_on(&g, "e4").contains(&EffectKind::Frozen));
    use_skill(&mut g, SkillId::Canceller, none());
    assert!(effects_on(&g, "e4").is_empty());
    mv(&mut g, "a7", "a6");
    assert!(can_move(&g, "e4", "e5"));
}

#[test]
fn keeps_the_remaining_duration_of_older_effects() {
    let mut g = game(
        "4k3/pp6/8/8/8/8/8/4K3 w - - 0 1",
        &[SkillId::Freeze, SkillId::Canceller],
        &[SkillId::Teleportation],
    );
    use_skill(&mut g, SkillId::Freeze, piece("a7")); // expires at ply 4
    use_skill(&mut g, SkillId::Teleportation, piece_to("b7", "h5"));
    let freeze = |g: &Game| {
        g.pos
            .effects
            .iter()
            .find(|e| e.kind == EffectKind::Frozen)
            .map(|e| e.expires_at)
    };
    assert_eq!(freeze(&g), Some(4));
    use_skill(&mut g, SkillId::Canceller, none());
    assert_eq!(kind_at(&g, "b7"), Some((Color::Black, PieceKind::Pawn)));
    assert!(g.pos.piece_at(s("h5")).is_none());
    assert_eq!(freeze(&g), Some(5), "shifted by the plies that went by");
    assert!(g.pos.is_frozen(at(&g, "a7").unwrap().id));
}

#[test]
fn removes_what_the_cancelled_skill_created() {
    let mut g = game(KINGS, &[SkillId::Canceller], &[SkillId::Mirage]);
    mv(&mut g, "e1", "d1");
    use_skill(&mut g, SkillId::Mirage, spawn("e4", PieceKind::Knight));
    assert_eq!(count_pieces(&g, Color::Black), 2);
    use_skill(&mut g, SkillId::Canceller, none());
    assert_eq!(count_pieces(&g, Color::Black), 1);
    assert!(at(&g, "e4").is_none());
}

#[test]
fn a_canceller_can_be_cancelled_in_turn() {
    let mut g = start(
        &[SkillId::Canceller],
        &[SkillId::Teleportation, SkillId::Canceller],
    );
    mv(&mut g, "e2", "e4");
    use_skill(&mut g, SkillId::Teleportation, piece_to("g8", "h3"));
    let after_teleport = g.pos.board;
    use_skill(&mut g, SkillId::Canceller, none());
    assert!(at(&g, "h3").is_none());
    assert!(
        can_skill(&g, SkillId::Canceller, none()),
        "black may cancel the cancel"
    );
    use_skill(&mut g, SkillId::Canceller, none());
    assert_eq!(g.pos.board, after_teleport, "the teleport is back");
    assert_eq!(g.side_to_move(), Color::White);
}

#[test]
fn survives_a_free_action_but_not_a_move() {
    // Mind Reading does not break the "last action was a skill" link...
    let mut g = start(
        &[SkillId::Canceller, SkillId::Mind],
        &[SkillId::Teleportation],
    );
    mv(&mut g, "e2", "e4");
    use_skill(&mut g, SkillId::Teleportation, piece_to("g8", "h3"));
    use_skill(&mut g, SkillId::Mind, none());
    assert!(can_skill(&g, SkillId::Canceller, none()));

    // ... Mind Control does: it changes the position in the middle of the turn.
    let mut g = start(
        &[SkillId::Canceller, SkillId::Control],
        &[SkillId::Teleportation],
    );
    mv(&mut g, "e2", "e4");
    use_skill(&mut g, SkillId::Teleportation, piece_to("g8", "h3"));
    use_skill(&mut g, SkillId::Control, piece("a7"));
    assert!(!has_skill(&g, SkillId::Canceller));
}

#[test]
fn brings_a_benched_piece_back() {
    let mut g = start(&[SkillId::Canceller], &[SkillId::Bench]);
    mv(&mut g, "e2", "e4");
    use_skill(&mut g, SkillId::Bench, piece("b8"));
    assert_eq!(g.pos.benched.len(), 1);
    use_skill(&mut g, SkillId::Canceller, none());
    assert!(g.pos.benched.is_empty());
    assert_eq!(kind_at(&g, "b8"), Some((Color::Black, PieceKind::Knight)));
}
