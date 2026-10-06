use crate::common::*;

#[test]
fn marks_one_of_your_pieces_for_two_enemy_turns() {
    let mut g = game(
        "4k3/8/8/8/8/8/P7/4K3 w - - 0 1",
        &[SkillId::Invisibility],
        &[],
    );
    let ev = use_skill(&mut g, SkillId::Invisibility, piece("a2"));
    assert!(effects_on(&g, "a2").contains(&EffectKind::Invisible));
    assert!(ev.iter().any(|e| matches!(
        e,
        Event::EffectAdded { effect, expires_at, .. } if *effect == EffectKind::Invisible && *expires_at == 4
    )));
    let id = at(&g, "a2").unwrap().id;
    mv(&mut g, "e8", "d8"); // ply 2
    mv(&mut g, "e1", "d1"); // ply 3
    assert!(g.pos.has_effect(id, EffectKind::Invisible));
    mv(&mut g, "d8", "e8"); // ply 4
    assert!(!g.pos.has_effect(id, EffectKind::Invisible), "worn off");
}

#[test]
fn only_your_pieces_and_never_the_king() {
    let g = game(
        "4k3/8/8/8/8/8/P7/4K3 w - - 0 1",
        &[SkillId::Invisibility],
        &[],
    );
    assert_eq!(targets_of(&g, SkillId::Invisibility), vec![piece("a2")]);
}

#[test]
fn does_not_change_how_the_piece_moves() {
    let mut g = game(
        "4k3/8/8/8/8/8/R7/4K3 w - - 0 1",
        &[SkillId::Invisibility],
        &[],
    );
    let before = moves_from(&g, "a2");
    use_skill(&mut g, SkillId::Invisibility, piece("a2"));
    mv(&mut g, "e8", "d8");
    assert_eq!(moves_from(&g, "a2"), before);
}

#[test]
fn cannot_be_stacked_on_an_already_invisible_piece() {
    let mut g = game(
        "4k3/8/8/8/8/8/P7/4K3 w - - 0 1",
        &[SkillId::Invisibility, SkillId::Invisibility],
        &[],
    );
    use_skill(&mut g, SkillId::Invisibility, piece("a2"));
    mv(&mut g, "e8", "d8");
    assert!(!has_skill(&g, SkillId::Invisibility));
}
