use crate::common::*;

const BACK_RANK: &str = "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1";

fn best_move_of(ev: &[Event]) -> Option<(Square, Square, Option<PieceKind>)> {
    ev.iter().find_map(|e| match e {
        Event::BestMove { from, to, promo } => Some((*from, *to, *promo)),
        _ => None,
    })
}

#[test]
fn names_the_best_move_without_touching_the_position() {
    let mut g = game(BACK_RANK, &[SkillId::Mind], &[]);
    let fen = g.pos.to_fen();
    let ev = use_skill(&mut g, SkillId::Mind, none());
    assert_eq!(best_move_of(&ev), Some((s("a1"), s("a8"), None)));
    assert_eq!(g.pos.to_fen(), fen);
    assert_eq!(g.side_to_move(), Color::White);
    assert_eq!(g.pos.ply, 0);
}

#[test]
fn does_not_cost_the_turn_and_can_be_used_three_times() {
    let mut g = game(BACK_RANK, &[SkillId::Mind], &[]);
    for n in 1..=3u8 {
        assert!(can_skill(&g, SkillId::Mind, none()), "use {n}");
        use_skill(&mut g, SkillId::Mind, none());
        let slot = slot(&g, Color::White, SkillId::Mind);
        assert_eq!(slot.uses, n);
        assert_eq!(slot.used, n == 3);
    }
    assert!(!has_skill(&g, SkillId::Mind), "spent after three uses");
    assert_eq!(g.side_to_move(), Color::White);
    assert_eq!(
        g.outcome(),
        Outcome::Ongoing,
        "no repetition from re-using it"
    );
    assert!(can_move(&g, "a1", "a8"), "the player still has to move");
}

#[test]
fn stays_available_on_later_turns() {
    let mut g = game(BACK_RANK, &[SkillId::Mind], &[]);
    use_skill(&mut g, SkillId::Mind, none());
    mv(&mut g, "e1", "d1");
    mv(&mut g, "g8", "h8");
    assert!(can_skill(&g, SkillId::Mind, none()));
    assert_eq!(slot(&g, Color::White, SkillId::Mind).uses, 1);
}

#[test]
fn works_in_check_and_names_a_legal_evasion() {
    let mut g = game("4r1k1/8/8/8/8/8/8/4K3 w - - 0 1", &[SkillId::Mind], &[]);
    let ev = use_skill(&mut g, SkillId::Mind, none());
    let (from, to, _) = best_move_of(&ev).expect("a best move");
    assert!(
        can_move(&g, &name(from), &name(to)),
        "{} {}",
        name(from),
        name(to)
    );
}

#[test]
fn does_not_save_from_checkmate() {
    let mut g = start(&[SkillId::Mind], &[]);
    mv(&mut g, "f2", "f3");
    mv(&mut g, "e7", "e5");
    mv(&mut g, "g2", "g4");
    mv(&mut g, "d8", "h4");
    assert_eq!(
        g.outcome(),
        Outcome::Checkmate {
            winner: Color::Black
        }
    );
    assert!(g.legal_actions().is_empty());
}

#[test]
fn includes_the_promotion_piece() {
    let mut g = game("8/P5k1/8/8/8/8/8/4K3 w - - 0 1", &[SkillId::Mind], &[]);
    let ev = use_skill(&mut g, SkillId::Mind, none());
    let (from, to, promo) = best_move_of(&ev).unwrap();
    assert_eq!((from, to), (s("a7"), s("a8")));
    assert!(promo.is_some());
}

#[test]
fn is_unique_and_keeps_the_turn() {
    assert_eq!(SkillId::Mind.kind(), SkillKind::Unique);
    assert_eq!(SkillId::Mind.max_uses(), 3);
    assert!(!SkillId::Mind.ends_turn());
}
