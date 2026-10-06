use chessy_engine::position::{BLACK_KING_SIDE, BLACK_QUEEN_SIDE};

use crate::common::*;

#[test]
fn an_enemy_piece_that_attacks_nothing_changes_sides_for_good() {
    let mut g = game(
        "4k3/7b/8/8/8/8/8/4K3 w - - 0 1",
        &[SkillId::Switch],
        &[SkillId::Freeze],
    );
    assert_eq!(targets_of(&g, SkillId::Switch), vec![piece("h7")]);
    let id = at(&g, "h7").unwrap().id;
    let ev = use_skill(&mut g, SkillId::Switch, piece("h7"));
    let p = at(&g, "h7").unwrap();
    assert_eq!(
        (p.id, p.color, p.kind),
        (id, Color::White, PieceKind::Bishop)
    );
    assert!(ev
        .iter()
        .any(|e| matches!(e, Event::Switched { square, .. } if *square == s("h7"))));
    // It is now white's bishop, for good.
    mv(&mut g, "e8", "d8");
    assert!(can_move(&g, "h7", "g8"));
    assert_eq!(g.side_to_move(), Color::White);
}

#[test]
fn refuses_pieces_that_attack_one_of_yours_and_kings() {
    let g = game("4k3/8/8/4b3/8/2P5/8/4K3 w - - 0 1", &[SkillId::Switch], &[]);
    // The bishop attacks the pawn on c3.
    assert!(!has_skill(&g, SkillId::Switch));

    let g = game("4k3/8/8/8/8/8/8/4K3 w - - 0 1", &[SkillId::Switch], &[]);
    assert!(!can_skill(&g, SkillId::Switch, piece("e8")));
}

#[test]
fn a_frozen_piece_attacks_nothing_and_loses_its_effects() {
    let mut g = game(
        "4k3/8/8/4b3/8/2P5/8/4K3 w - - 0 1",
        &[SkillId::Freeze, SkillId::Switch],
        &[],
    );
    use_skill(&mut g, SkillId::Freeze, piece("e5"));
    mv(&mut g, "e8", "d8");
    assert!(can_skill(&g, SkillId::Switch, piece("e5")));
    use_skill(&mut g, SkillId::Switch, piece("e5"));
    assert_eq!(kind_at(&g, "e5"), Some((Color::White, PieceKind::Bishop)));
    assert!(
        effects_on(&g, "e5").is_empty(),
        "the freeze went with the old side"
    );
}

#[test]
fn refused_when_it_would_checkmate() {
    // Black's rook on b8 would check the cornered king from the white side.
    let g = game("1r5k/6pp/8/8/8/8/8/4K3 w - - 0 1", &[SkillId::Switch], &[]);
    assert!(!can_skill(&g, SkillId::Switch, piece("b8")));

    // With a queen able to take the new white rook it is not mate: allowed.
    let g = game(
        "1r5k/6pp/3q4/8/8/8/8/4K3 w - - 0 1",
        &[SkillId::Switch],
        &[],
    );
    assert!(can_skill(&g, SkillId::Switch, piece("b8")));
}

#[test]
fn a_switched_rook_ends_the_castling_right_it_carried() {
    let mut g = game("r3k2r/8/8/8/8/8/8/4K3 w kq - 0 1", &[SkillId::Switch], &[]);
    assert!(can_skill(&g, SkillId::Switch, piece("h8")));
    use_skill(&mut g, SkillId::Switch, piece("h8"));
    assert_eq!(g.pos.castling & BLACK_KING_SIDE, 0);
    assert_ne!(
        g.pos.castling & BLACK_QUEEN_SIDE,
        0,
        "the other rook still castles"
    );
}

#[test]
fn is_unique() {
    assert_eq!(SkillId::Switch.kind(), SkillKind::Unique);
}
