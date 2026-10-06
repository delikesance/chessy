use crate::common::*;

#[test]
fn turns_a_piece_into_a_queen_keeping_its_identity() {
    let mut g = start(&[SkillId::Evolve], &[]);
    let id = at(&g, "e2").unwrap().id;
    let ev = use_skill(&mut g, SkillId::Evolve, piece("e2"));
    let p = at(&g, "e2").unwrap();
    assert_eq!(
        (p.id, p.kind, p.color),
        (id, PieceKind::Queen, Color::White)
    );
    assert!(ev.iter().any(|e| matches!(
        e,
        Event::Transformed { square, kind } if *square == s("e2") && *kind == PieceKind::Queen
    )));
    assert_eq!(g.side_to_move(), Color::Black);
}

#[test]
fn works_on_every_piece_but_kings_and_queens() {
    let g = start(&[SkillId::Evolve], &[]);
    let targets = targets_of(&g, SkillId::Evolve);
    assert_eq!(targets.len(), 14, "8 pawns, 2 knights, 2 bishops, 2 rooks");
    assert!(!targets.contains(&piece("e1")));
    assert!(!targets.contains(&piece("d1")));
    assert!(
        !targets.contains(&piece("e7")),
        "enemy pieces are not targets"
    );
}

#[test]
fn refuses_kings_queens_and_enemies() {
    let mut g = start(&[SkillId::Evolve], &[]);
    assert!(skill_fails(&mut g, SkillId::Evolve, piece("e1")));
    assert!(skill_fails(&mut g, SkillId::Evolve, piece("d1")));
    assert!(skill_fails(&mut g, SkillId::Evolve, piece("e7")));
    assert!(skill_fails(&mut g, SkillId::Evolve, square("e4")));
}

#[test]
fn is_for_good_even_on_a_morphed_piece() {
    let mut g = game(
        "4k3/8/8/8/8/8/8/N3K3 w - - 0 1",
        &[SkillId::Morph, SkillId::Evolve],
        &[],
    );
    use_skill(&mut g, SkillId::Morph, spawn("a1", PieceKind::Bishop));
    mv(&mut g, "e8", "d8");
    use_skill(&mut g, SkillId::Evolve, piece("a1"));
    mv(&mut g, "d8", "e8");
    mv(&mut g, "e1", "e2");
    // The Morph would have run out by now; it must not undo the evolution.
    assert_eq!(g.pos.ply, 5);
    assert_eq!(kind_at(&g, "a1"), Some((Color::White, PieceKind::Queen)));
    assert!(g.pos.effects.is_empty());
}

#[test]
fn a_new_queen_can_give_check() {
    let mut g = game("4k3/8/8/8/8/8/4R3/4K3 w - - 0 1", &[SkillId::Evolve], &[]);
    use_skill(&mut g, SkillId::Evolve, piece("e2"));
    assert!(g.pos.in_check(Color::Black));
}
