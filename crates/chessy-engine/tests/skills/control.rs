use crate::common::*;

#[test]
fn an_enemy_piece_fights_for_you_until_the_end_of_the_turn() {
    let mut g = game("4k3/8/8/8/8/8/r7/4K3 w - - 0 1", &[SkillId::Control], &[]);
    use_skill(&mut g, SkillId::Control, piece("a2"));
    assert_eq!(g.side_to_move(), Color::White, "the turn is not spent");
    assert_eq!(g.pos.ply, 0);
    assert_eq!(kind_at(&g, "a2"), Some((Color::White, PieceKind::Rook)));
    assert!(can_move(&g, "a2", "a8"));

    let ev = mv(&mut g, "a2", "a3");
    assert_eq!(kind_at(&g, "a3"), Some((Color::Black, PieceKind::Rook)));
    assert!(ev
        .iter()
        .any(|e| matches!(e, Event::LoanEnded { square, .. } if *square == s("a3"))));
    assert_eq!(g.side_to_move(), Color::Black);
    assert!(g.pos.effects.is_empty());
}

#[test]
fn the_piece_goes_back_even_if_another_piece_moves() {
    let mut g = game("4k3/8/8/8/8/8/r7/4K3 w - - 0 1", &[SkillId::Control], &[]);
    use_skill(&mut g, SkillId::Control, piece("a2"));
    mv(&mut g, "e1", "d1");
    assert_eq!(kind_at(&g, "a2"), Some((Color::Black, PieceKind::Rook)));
}

#[test]
fn a_controlled_piece_can_take_enemy_pieces() {
    let mut g = game("4k3/8/8/8/8/8/r6p/4K3 w - - 0 1", &[SkillId::Control], &[]);
    use_skill(&mut g, SkillId::Control, piece("a2"));
    mv(&mut g, "a2", "h2");
    assert_eq!(kind_at(&g, "h2"), Some((Color::Black, PieceKind::Rook)));
    assert_eq!(g.pos.captured_pawns, [0, 1]);
}

#[test]
fn never_the_king_and_only_once() {
    let mut g = game("4k3/8/8/8/8/8/r7/4K3 w - - 0 1", &[SkillId::Control], &[]);
    assert!(skill_fails(&mut g, SkillId::Control, piece("e8")));
    assert!(skill_fails(&mut g, SkillId::Control, piece("e1")));
    use_skill(&mut g, SkillId::Control, piece("a2"));
    assert!(!has_skill(&g, SkillId::Control));
    let slot = slot(&g, Color::White, SkillId::Control);
    assert!(slot.used);
    assert_eq!(slot.uses, 1);
}

#[test]
fn can_save_a_player_from_checkmate() {
    let fen = "6k1/8/8/8/8/8/5PPP/r5K1 w - - 0 1";
    let g = game(fen, &[], &[]);
    assert_eq!(
        g.outcome(),
        Outcome::Checkmate {
            winner: Color::Black
        }
    );

    let mut g = game(fen, &[SkillId::Control], &[]);
    assert_eq!(g.outcome(), Outcome::Ongoing);
    assert!(can_skill(&g, SkillId::Control, piece("a1")));
    use_skill(&mut g, SkillId::Control, piece("a1"));
    assert!(
        !g.pos.in_check(Color::White),
        "the checking rook is ours now"
    );
    assert!(can_move(&g, "a1", "a8"));
}

#[test]
fn needs_a_legal_move_afterwards() {
    // Controlling the wrong piece leaves white in check with no move: refused.
    let g = game(
        "6k1/8/8/8/p7/8/5PPP/r5K1 w - - 0 1",
        &[SkillId::Control],
        &[],
    );
    assert!(!can_skill(&g, SkillId::Control, piece("a4")));
    assert!(can_skill(&g, SkillId::Control, piece("a1")));
}

#[test]
fn is_refused_if_the_borrowed_piece_would_attack_the_enemy_king() {
    // A white pawn on f7 would attack e8: the king could simply be taken.
    let g = game("4k3/5p2/8/8/8/8/8/4K3 w - - 0 1", &[SkillId::Control], &[]);
    assert!(!can_skill(&g, SkillId::Control, piece("f7")));
}

#[test]
fn the_loan_also_ends_when_a_skill_passes_the_turn() {
    let mut g = game(
        "4k3/8/8/8/8/8/r7/4K3 w - - 0 1",
        &[SkillId::Control, SkillId::Teleportation],
        &[],
    );
    use_skill(&mut g, SkillId::Control, piece("a2"));
    use_skill(&mut g, SkillId::Teleportation, piece_to("a2", "h5"));
    assert_eq!(kind_at(&g, "h5"), Some((Color::Black, PieceKind::Rook)));
}

#[test]
fn is_unique_and_keeps_the_turn() {
    assert_eq!(SkillId::Control.kind(), SkillKind::Unique);
    assert!(!SkillId::Control.ends_turn());
}
