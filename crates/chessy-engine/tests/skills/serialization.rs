use serde_json::{json, Value};

use crate::common::*;

fn ids() -> Vec<String> {
    SkillId::ALL
        .iter()
        .map(|id| {
            serde_json::to_value(id)
                .unwrap()
                .as_str()
                .unwrap()
                .to_string()
        })
        .collect()
}

#[test]
fn skill_ids_use_the_documented_names() {
    assert_eq!(SkillId::ALL.len(), 27);
    assert_eq!(
        ids(),
        [
            "teleportation",
            "imune",
            "freeze",
            "rollback",
            "clone",
            "destiny_swapper",
            "remover",
            "wall",
            "mirage",
            "evolve",
            "switch",
            "mind",
            "control",
            "morph",
            "canceller",
            "tornado",
            "invisibility",
            "terminator",
            "trap",
            "bench",
            "forcefield",
            "transposition",
            "queensac",
            "temporal",
            "geomancy",
            "celestial",
            "godhelp",
        ]
    );
    for id in SkillId::ALL {
        let back: SkillId = serde_json::from_value(serde_json::to_value(id).unwrap()).unwrap();
        assert_eq!(back, id);
    }
}

#[test]
fn skill_kinds_and_uses_are_as_specified() {
    let unique: Vec<SkillId> = SkillId::ALL
        .into_iter()
        .filter(|id| id.kind() == SkillKind::Unique)
        .collect();
    assert_eq!(unique.len(), 7);
    assert_eq!(
        SkillId::ALL
            .into_iter()
            .filter(|id| id.kind() == SkillKind::Classic)
            .count(),
        20
    );
    for id in SkillId::ALL {
        let expected = if id == SkillId::Mind { 3 } else { 1 };
        assert_eq!(id.max_uses(), expected, "{id:?}");
        let passes_turn = !matches!(id, SkillId::Mind | SkillId::Control);
        assert_eq!(id.ends_turn(), passes_turn, "{id:?}");
    }
}

#[test]
fn targets_have_a_tag_and_flat_fields() {
    let cases = [
        (SkillTarget::None, json!({"kind": "none"})),
        (
            SkillTarget::Piece { square: 12 },
            json!({"kind": "piece", "square": 12}),
        ),
        (
            SkillTarget::Square { square: 28 },
            json!({"kind": "square", "square": 28}),
        ),
        (
            SkillTarget::Pair { a: 1, b: 2 },
            json!({"kind": "pair", "a": 1, "b": 2}),
        ),
        (
            SkillTarget::PieceTo { from: 1, to: 2 },
            json!({"kind": "piece_to", "from": 1, "to": 2}),
        ),
        (
            SkillTarget::Spawn {
                square: 28,
                kind: PieceKind::Queen,
            },
            json!({"kind": "spawn", "square": 28, "piece": "queen"}),
        ),
    ];
    for (target, expected) in cases {
        let value = serde_json::to_value(target).unwrap();
        assert_eq!(value, expected);
        let back: SkillTarget = serde_json::from_value(value).unwrap();
        assert_eq!(back, target);
    }
    // Actions embed them.
    let action: Action = serde_json::from_value(json!({
        "type": "skill", "skill": "mirage",
        "target": {"kind": "spawn", "square": 27, "piece": "rook"}
    }))
    .unwrap();
    assert_eq!(
        action,
        Action::Skill {
            skill: SkillId::Mirage,
            target: SkillTarget::Spawn {
                square: 27,
                kind: PieceKind::Rook
            }
        }
    );
}

#[test]
fn new_events_serialize_with_snake_case_types() {
    let mut g = game(
        "k7/6N1/5N2/4N3/8/8/8/K7 w - - 0 1",
        &[SkillId::Tornado],
        &[],
    );
    let ev = use_skill(&mut g, SkillId::Tornado, none());
    let value: Value = serde_json::to_value(&ev).unwrap();
    assert_eq!(value[0]["type"], "skill_used");
    assert_eq!(value[1]["type"], "rotated");
    assert_eq!(
        value[1]["moves"][0],
        json!({"from": s("e5"), "to": s("f6")})
    );

    let simple = [
        (
            Event::TrapSet { square: 3 },
            json!({"type": "trap_set", "square": 3}),
        ),
        (
            Event::TrapSprung {
                square: 3,
                piece: 7,
            },
            json!({"type": "trap_sprung", "square": 3, "piece": 7}),
        ),
        (
            Event::Pushed {
                piece: 1,
                from: 2,
                to: 3,
            },
            json!({"type": "pushed", "piece": 1, "from": 2, "to": 3}),
        ),
        (
            Event::Saved {
                piece: 1,
                from: 2,
                to: 3,
            },
            json!({"type": "saved", "piece": 1, "from": 2, "to": 3}),
        ),
        (
            Event::BestMove {
                from: 8,
                to: 16,
                promo: None,
            },
            json!({"type": "best_move", "from": 8, "to": 16}),
        ),
        (
            Event::BestMove {
                from: 8,
                to: 16,
                promo: Some(PieceKind::Queen),
            },
            json!({"type": "best_move", "from": 8, "to": 16, "promo": "queen"}),
        ),
        (
            Event::Cancelled {
                skill: SkillId::Freeze,
            },
            json!({"type": "cancelled", "skill": "freeze"}),
        ),
        (
            Event::Terrain {
                squares: vec![27, 28],
            },
            json!({"type": "terrain", "squares": [27, 28]}),
        ),
        (
            Event::Transformed {
                square: 5,
                kind: PieceKind::Queen,
            },
            json!({"type": "transformed", "square": 5, "kind": "queen"}),
        ),
    ];
    for (event, expected) in simple {
        assert_eq!(serde_json::to_value(&event).unwrap(), expected);
        let back: Event = serde_json::from_value(expected).unwrap();
        assert_eq!(back, event);
    }
}

#[test]
fn pieces_serialize_their_flags_only_when_set() {
    let plain = Piece::new(3, PieceKind::Knight, Color::White, 1);
    assert_eq!(
        serde_json::to_value(plain).unwrap(),
        json!({"id": 3, "kind": "knight", "color": "white", "home": 1})
    );
    let mut fancy = plain;
    fancy.mirage = true;
    fancy.temp = true;
    assert_eq!(
        serde_json::to_value(fancy).unwrap(),
        json!({"id": 3, "kind": "knight", "color": "white", "home": 1, "mirage": true, "temp": true})
    );
    let back: Piece =
        serde_json::from_value(json!({"id": 3, "kind": "pawn", "color": "black"})).unwrap();
    assert!(!back.wall && !back.mirage && !back.temp);
}

#[test]
fn effects_serialize_new_kinds_and_optional_fields() {
    let mut loan = ActiveEffect::new(EffectKind::ColorLoan, 4, 9);
    loan.orig_color = Some(Color::Black);
    assert_eq!(
        serde_json::to_value(loan).unwrap(),
        json!({"kind": "color_loan", "piece": 4, "expires_at": 9, "orig_color": "black"})
    );
    let plain = ActiveEffect::new(EffectKind::Forcefield, 4, NEVER);
    assert_eq!(
        serde_json::to_value(plain).unwrap(),
        json!({"kind": "forcefield", "piece": 4, "expires_at": NEVER})
    );
    for kind in [
        EffectKind::Invisible,
        EffectKind::Celestial,
        EffectKind::Locked,
        EffectKind::Morphed,
        EffectKind::Vanish,
        EffectKind::Terrain,
    ] {
        let v = serde_json::to_value(kind).unwrap();
        assert_eq!(serde_json::from_value::<EffectKind>(v).unwrap(), kind);
    }
}

#[test]
fn skill_slots_report_their_uses() {
    let mut g = game(KINGS, &[SkillId::Mind, SkillId::Freeze], &[]);
    use_skill(&mut g, SkillId::Mind, none());
    let slots = serde_json::to_value(g.loadout(Color::White)).unwrap();
    assert_eq!(
        slots["slots"][0],
        json!({"skill": "mind", "used": false, "uses": 1})
    );
    assert_eq!(
        slots["slots"][1],
        json!({"skill": "freeze", "used": false, "uses": 0})
    );
}
