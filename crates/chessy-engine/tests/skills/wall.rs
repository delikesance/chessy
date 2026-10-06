use crate::common::*;

/// A game where `color` has already lost `dead` pawns.
fn with_graveyard(fen: &str, white: &[SkillId], black: &[SkillId], dead: [u8; 2]) -> Game {
    let mut pos = Position::from_fen(fen).unwrap();
    pos.captured_pawns = dead;
    Game::from_position(pos, white, black)
}

const SPARSE: &str = "4k3/8/8/8/8/8/PPPP1PPP/4K3 w - - 0 1";

#[test]
fn brings_pawns_back_on_the_third_rank_nearest_the_king() {
    let mut g = with_graveyard(SPARSE, &[SkillId::Wall], &[], [2, 0]);
    let ev = use_skill(&mut g, SkillId::Wall, none());
    for sqr in ["e3", "d3"] {
        let p = at(&g, sqr).unwrap_or_else(|| panic!("a pawn on {sqr}"));
        assert_eq!((p.color, p.kind), (Color::White, PieceKind::Pawn));
        assert!(p.wall);
        assert!(g.pos.is_frozen(p.id), "{sqr} is locked");
    }
    assert!(at(&g, "f3").is_none(), "only two pawns were dead");
    assert_eq!(g.pos.captured_pawns, [0, 0]);
    assert_eq!(
        ev.iter()
            .filter(|e| matches!(e, Event::Spawned { .. }))
            .count(),
        2
    );
    assert_eq!(g.side_to_move(), Color::Black);
}

#[test]
fn never_more_than_three_pawns() {
    let mut g = with_graveyard(SPARSE, &[SkillId::Wall], &[], [5, 0]);
    use_skill(&mut g, SkillId::Wall, none());
    for sqr in ["e3", "d3", "f3"] {
        assert!(at(&g, sqr).is_some_and(|p| p.wall), "{sqr}");
    }
    assert!(at(&g, "c3").is_none());
    assert_eq!(g.pos.captured_pawns, [2, 0]);
}

#[test]
fn falls_back_on_the_second_rank_when_the_third_is_full() {
    // Third rank full except nothing: fill it, leave a gap on the second.
    let mut g = with_graveyard(
        "4k3/8/8/8/8/PPPPPPPP/PPPP1PPP/4K3 w - - 0 1",
        &[SkillId::Wall],
        &[],
        [1, 0],
    );
    use_skill(&mut g, SkillId::Wall, none());
    assert!(at(&g, "e2").is_some_and(|p| p.wall));
}

#[test]
fn pawns_are_locked_until_the_owners_next_turn() {
    let mut g = with_graveyard(SPARSE, &[SkillId::Wall], &[], [1, 0]);
    use_skill(&mut g, SkillId::Wall, none());
    let id = at(&g, "e3").unwrap().id;
    assert!(g.pos.is_frozen(id));
    assert!(!has_piece_moves(&g, "e3"));
    mv(&mut g, "e8", "d8");
    assert!(!g.pos.is_frozen(id), "free again on their next turn");
    assert!(can_move(&g, "e3", "e4"));
}

fn has_piece_moves(g: &Game, from: &str) -> bool {
    !moves_from(g, from).is_empty()
}

#[test]
fn wall_pawns_do_not_count_in_the_graveyard_but_normal_ones_do() {
    // A normal pawn captured: counted.
    let mut g = game("4k3/8/1b6/8/8/4P3/8/4K3 b - - 0 1", &[], &[]);
    mv(&mut g, "b6", "e3");
    assert_eq!(g.pos.captured_pawns, [1, 0]);

    // A wall pawn captured: not counted.
    let mut g = with_graveyard(
        "4k3/8/1b6/8/8/8/8/4K3 w - - 0 1",
        &[SkillId::Wall],
        &[],
        [1, 0],
    );
    use_skill(&mut g, SkillId::Wall, none());
    assert!(at(&g, "e3").is_some_and(|p| p.wall));
    mv(&mut g, "b6", "e3");
    assert_eq!(g.pos.captured_pawns, [0, 0]);
}

#[test]
fn needs_a_dead_pawn_and_a_free_square() {
    let g = start(&[SkillId::Wall], &[]);
    assert!(!has_skill(&g, SkillId::Wall), "nothing to bring back");

    let g = with_graveyard(
        "4k3/8/8/8/8/PPPPPPPP/PPPPPPPP/4K3 w - - 0 1",
        &[SkillId::Wall],
        &[],
        [2, 0],
    );
    assert!(!has_skill(&g, SkillId::Wall), "no free square");
}

#[test]
fn black_uses_the_sixth_rank() {
    let mut g = with_graveyard(
        "4k3/8/8/8/8/8/8/4K3 b - - 0 1",
        &[],
        &[SkillId::Wall],
        [0, 1],
    );
    use_skill(&mut g, SkillId::Wall, none());
    assert!(at(&g, "e6").is_some_and(|p| p.wall && p.color == Color::Black));
    assert_eq!(g.pos.captured_pawns, [0, 0]);
}

#[test]
fn can_block_a_check_but_is_refused_when_the_king_stays_in_check() {
    let g = with_graveyard(
        "4r1k1/8/8/8/8/8/8/4K3 w - - 0 1",
        &[SkillId::Wall],
        &[],
        [1, 0],
    );
    assert!(can_skill(&g, SkillId::Wall, none()), "the pawn lands on e3");

    let g = with_graveyard(
        "6k1/8/8/8/8/8/8/r3K3 w - - 0 1",
        &[SkillId::Wall],
        &[],
        [1, 0],
    );
    assert!(!can_skill(&g, SkillId::Wall, none()));
}

#[test]
fn is_a_unique_one_use_skill() {
    assert_eq!(SkillId::Wall.kind(), SkillKind::Unique);
    assert_eq!(SkillId::Wall.max_uses(), 1);
    assert!(SkillId::Wall.ends_turn());
}
