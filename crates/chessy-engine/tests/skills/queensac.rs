use crate::common::*;

/// Back-rank mate on g1 where the queen on h3 cannot help.
const MATE: &str = "6k1/8/8/8/8/7Q/5PPP/r5K1 w - - 0 1";

#[test]
fn the_king_takes_the_queens_square_and_the_queen_dies_on_his() {
    let mut g = game(MATE, &[SkillId::Queensac], &[]);
    let ev = use_skill(&mut g, SkillId::Queensac, none());
    assert_eq!(kind_at(&g, "h3"), Some((Color::White, PieceKind::King)));
    assert!(
        at(&g, "g1").is_none(),
        "the queen died on the king's old square"
    );
    assert!(ev.iter().any(|e| matches!(
        e,
        Event::Captured { square, piece } if *square == s("g1") && piece.kind == PieceKind::Queen
    )));
    assert!(!g.pos.in_check(Color::White));
    assert_eq!(g.side_to_move(), Color::Black);
}

#[test]
fn saves_a_player_who_would_be_checkmated() {
    let g = game(MATE, &[], &[]);
    assert_eq!(
        g.outcome(),
        Outcome::Checkmate {
            winner: Color::Black
        }
    );
    let g = game(MATE, &[SkillId::Queensac], &[]);
    assert_eq!(g.outcome(), Outcome::Ongoing);
    assert!(can_skill(&g, SkillId::Queensac, none()));
}

#[test]
fn only_in_check_and_with_a_queen() {
    let g = start(&[SkillId::Queensac], &[]);
    assert!(!has_skill(&g, SkillId::Queensac), "not in check");
    let g = game(
        "6k1/8/8/8/8/8/5PPP/r5K1 w - - 0 1",
        &[SkillId::Queensac],
        &[],
    );
    assert!(!has_skill(&g, SkillId::Queensac), "no queen");
}

#[test]
fn the_king_must_be_safe_on_arrival() {
    // The bishop on d7 covers h3.
    let g = game(
        "6k1/3b4/8/8/8/7Q/5PPP/r5K1 w - - 0 1",
        &[SkillId::Queensac],
        &[],
    );
    assert!(!can_skill(&g, SkillId::Queensac, none()));
}

#[test]
fn with_several_queens_the_safe_one_is_sacrificed() {
    // The bishop on f7 covers b3 (the first queen in square order), not h3.
    let mut g = game(
        "6k1/5b2/8/8/8/1Q5Q/5PPP/r5K1 w - - 0 1",
        &[SkillId::Queensac],
        &[],
    );
    use_skill(&mut g, SkillId::Queensac, none());
    assert_eq!(kind_at(&g, "h3"), Some((Color::White, PieceKind::King)));
    assert_eq!(kind_at(&g, "b3"), Some((Color::White, PieceKind::Queen)));
}
