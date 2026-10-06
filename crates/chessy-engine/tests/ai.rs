use chessy_engine::ai::{choose_action, choose_action_with, Rng, Strength};
use chessy_engine::{Action, Color, Game, Outcome, PieceKind, Position, SkillId, SkillKind};

fn classics() -> Vec<SkillId> {
    SkillId::ALL
        .into_iter()
        .filter(|s| s.kind() == SkillKind::Classic)
        .collect()
}

/// Cheaper than the real level so tests stay fast in debug builds.
fn cheap(elo: i32, nodes: u64) -> Strength {
    Strength {
        node_budget: nodes,
        ..Strength::from_elo(elo)
    }
}

// ---- levels --------------------------------------------------------------------

#[test]
fn strength_follows_the_spec_table() {
    let depth = |elo| Strength::from_elo(elo).depth;
    assert_eq!(depth(400), 1);
    assert_eq!(depth(799), 1);
    assert_eq!(depth(800), 2);
    assert_eq!(depth(1199), 2);
    assert_eq!(depth(1200), 3);
    assert_eq!(depth(1599), 3);
    assert_eq!(depth(1600), 4);
    assert_eq!(depth(1999), 4);
    assert_eq!(depth(2000), 5);
    assert_eq!(depth(2399), 5);
    assert_eq!(depth(2400), 6);
    assert_eq!(depth(2800), 6);
    // Clamped outside the supported range.
    assert_eq!(Strength::from_elo(-50), Strength::from_elo(400));
    assert_eq!(Strength::from_elo(9000), Strength::from_elo(2800));
    // Budgets and the evaluation.
    assert_eq!(Strength::from_elo(2000).think_ms, 1_500);
    assert_eq!(Strength::from_elo(2400).think_ms, 3_000);
    assert!(Strength::from_elo(2400).full_eval);
    assert!(!Strength::from_elo(1000).full_eval);
}

#[test]
fn strength_interpolates_inside_a_tier() {
    let low = Strength::from_elo(400);
    let mid = Strength::from_elo(600);
    let high = Strength::from_elo(799);
    assert_eq!(low.blunder_permille, 550);
    assert_eq!(mid.blunder_permille, 425);
    assert!(high.blunder_permille < 305 && high.blunder_permille >= 300);
    assert!(low.dispersion > mid.dispersion && mid.dispersion > high.dispersion);
    assert_eq!(Strength::from_elo(1200).blunder_permille, 30);
    assert_eq!(Strength::from_elo(2000).blunder_permille, 0);
}

#[test]
fn strength_grows_monotonically() {
    let mut prev = Strength::from_elo(400);
    for elo in (450..=2800).step_by(50) {
        let s = Strength::from_elo(elo);
        assert!(s.depth >= prev.depth, "depth at {elo}");
        assert!(s.think_ms >= prev.think_ms, "time at {elo}");
        assert!(s.node_budget >= prev.node_budget, "nodes at {elo}");
        assert!(
            s.blunder_permille <= prev.blunder_permille,
            "blunder at {elo}"
        );
        assert!(s.dispersion <= prev.dispersion, "dispersion at {elo}");
        assert!(
            s.skill_threshold <= prev.skill_threshold,
            "threshold at {elo}"
        );
        assert!(s.skill_permille >= prev.skill_permille, "usage at {elo}");
        prev = s;
    }
    assert_eq!(Strength::from_elo(400).skill_threshold, 250);
    assert_eq!(Strength::from_elo(2800).skill_threshold, 60);
}

// ---- correctness ---------------------------------------------------------------

#[test]
fn plays_mate_in_one_from_800_up() {
    let cases = [
        // Back-rank mate: Ra8#.
        "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1",
        // Fool's mate for Black: Qh4#.
        "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
        // Queen and king against a lone king.
        "7k/8/6K1/8/8/8/8/7Q w - - 0 1",
        // Scholar's mate among many other pieces: Qxf7#.
        "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1",
    ];
    for fen in cases {
        for elo in [800, 1000, 1200, 1600, 2000, 2500, 2800] {
            for seed in 0..4 {
                let game = Game::from_position(Position::from_fen(fen).unwrap(), &[], &[]);
                let action = choose_action(&game, &cheap(elo, 20_000), seed).unwrap();
                let mut after = game.clone();
                after.apply(action).unwrap();
                assert!(
                    matches!(after.outcome(), Outcome::Checkmate { .. }),
                    "elo {elo}, seed {seed}: {action:?} does not mate in {fen}"
                );
            }
        }
    }
}

#[test]
fn returns_none_when_there_is_nothing_to_play() {
    let mut game = Game::new(&[], &[]);
    game.resign(Color::White);
    assert_eq!(choose_action(&game, &Strength::from_elo(1500), 1), None);
    // Stalemate.
    let game = Game::from_position(
        Position::from_fen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").unwrap(),
        &[],
        &[],
    );
    assert_eq!(choose_action(&game, &Strength::from_elo(1500), 1), None);
}

#[test]
fn a_single_legal_move_is_returned_straight_away() {
    // Black is in check from the rook and can only capture it.
    let game = Game::from_position(
        Position::from_fen("7k/8/8/8/8/8/6r1/6K1 w - - 0 1").unwrap(),
        &[],
        &[],
    );
    let action = choose_action(&game, &cheap(2400, 5_000), 3).unwrap();
    assert!(game.legal_actions().contains(&action));
}

/// Plays random games and asks the AI (at assorted levels) for an action at
/// every `every`-th position, checking it is legal. Returns (positions checked,
/// skill actions chosen).
fn check_legal(games: u64, steps: u32, every: u32, with_skills: bool, seed: u64) -> (u32, u32) {
    let mut rng = Rng::new(seed);
    let all = classics();
    let (mut checked, mut skills_chosen) = (0, 0);
    for game_no in 0..games {
        let pick = |offset: usize| -> Vec<SkillId> {
            if with_skills {
                (0..3).map(|i| all[(offset + i) % all.len()]).collect()
            } else {
                Vec::new()
            }
        };
        let mut game = Game::new(&pick(game_no as usize), &pick(game_no as usize + 2));
        for step in 0..steps {
            let actions = game.legal_actions();
            if actions.is_empty() {
                break;
            }
            if step % every == 0 {
                let elo = [400, 700, 900, 1300, 1700, 2100, 2600][rng.below(7) as usize];
                let nodes = 200 + rng.below(600);
                let action = choose_action(&game, &cheap(elo, nodes), rng.next_u64())
                    .expect("an action exists, so the AI finds one");
                assert!(
                    actions.contains(&action),
                    "illegal {action:?} at game {game_no} step {step} elo {elo}"
                );
                skills_chosen += matches!(action, Action::Skill { .. }) as u32;
                checked += 1;
            }
            // Advance by a random action, favouring plain moves.
            let moves: Vec<Action> = actions
                .iter()
                .copied()
                .filter(|a| matches!(a, Action::Move { .. }))
                .collect();
            let pool = if moves.is_empty() || rng.chance(60) {
                &actions
            } else {
                &moves
            };
            game.apply(pool[rng.below(pool.len() as u64) as usize])
                .unwrap();
        }
    }
    (checked, skills_chosen)
}

#[test]
fn never_proposes_an_illegal_action_in_plain_chess() {
    let (checked, _) = check_legal(12, 30, 1, false, 0xC0FFEE);
    assert!(checked >= 300, "only {checked} positions checked");
}

#[test]
fn never_proposes_an_illegal_action_with_skills() {
    let (checked, skills) = check_legal(10, 26, 2, true, 0xBEEF);
    assert!(checked >= 100, "only {checked} positions checked");
    eprintln!("{checked} positions, {skills} skill actions chosen");
}

#[test]
fn is_deterministic_for_a_given_seed() {
    let skills = classics();
    let mut game = Game::new(
        &skills[..3.min(skills.len())],
        &skills[..3.min(skills.len())],
    );
    let mut rng = Rng::new(7);
    for _ in 0..12 {
        let actions = game.legal_actions();
        for elo in [500, 1100, 1700, 2300] {
            let a = choose_action(&game, &cheap(elo, 3_000), 99).unwrap();
            let b = choose_action(&game, &cheap(elo, 3_000), 99).unwrap();
            assert_eq!(a, b, "elo {elo}");
        }
        game.apply(actions[rng.below(actions.len() as u64) as usize])
            .unwrap();
    }
}

#[test]
fn low_levels_vary_with_the_seed_and_high_levels_do_not() {
    let game = Game::new(&[], &[]);
    let low: std::collections::HashSet<String> = (0..40)
        .map(|seed| format!("{:?}", choose_action(&game, &cheap(400, 5_000), seed)))
        .collect();
    assert!(low.len() >= 4, "level 400 played only {low:?}");
    let high: std::collections::HashSet<String> = (0..10)
        .map(|seed| format!("{:?}", choose_action(&game, &cheap(2200, 5_000), seed)))
        .collect();
    assert_eq!(high.len(), 1, "level 2200 is deterministic: {high:?}");
}

#[test]
fn a_stop_signal_still_yields_a_legal_action() {
    let game = Game::new(&classics()[..3.min(classics().len())], &[]);
    let action = choose_action_with(&game, &Strength::from_elo(2800), 5, &|| true).unwrap();
    assert!(game.legal_actions().contains(&action));
}

#[test]
fn uses_a_skill_that_wins_material_at_high_levels() {
    // White's rook cannot reach the queen; a skill that removes or swaps it
    // would. Whatever the engine offers, the chosen action must be legal, and
    // a plain capture of a free queen is still preferred.
    let skills = classics();
    let game = Game::from_position(
        Position::from_fen("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1").unwrap(),
        &skills,
        &[],
    );
    let action = choose_action(&game, &cheap(2600, 20_000), 1).unwrap();
    assert!(
        game.legal_actions().contains(&action),
        "legal action expected"
    );
}

// ---- strength ------------------------------------------------------------------

/// Plays a full game between two levels and returns White's result in
/// `{0.0, 0.5, 1.0}` (an unfinished game is adjudicated on material).
fn play(white: &Strength, black: &Strength, game_seed: u64, max_plies: u32) -> f64 {
    let mut game = Game::new(&[], &[]);
    while !game.outcome().is_over() && game.pos.ply < max_plies {
        let strength = if game.side_to_move() == Color::White {
            white
        } else {
            black
        };
        let seed = game_seed
            .wrapping_mul(1000)
            .wrapping_add(game.pos.ply as u64);
        let action = choose_action(&game, strength, seed).expect("game is not over");
        game.apply(action).unwrap();
    }
    match game.outcome() {
        Outcome::Checkmate { winner } => {
            if winner == Color::White {
                1.0
            } else {
                0.0
            }
        }
        Outcome::Ongoing => {
            let value = |c: Color| -> i32 {
                game.pos
                    .pieces(c)
                    .map(|(_, p)| match p.kind {
                        PieceKind::Pawn => 100,
                        PieceKind::Knight | PieceKind::Bishop => 320,
                        PieceKind::Rook => 500,
                        PieceKind::Queen => 900,
                        PieceKind::King => 0,
                    })
                    .sum()
            };
            let diff = value(Color::White) - value(Color::Black);
            if diff >= 300 {
                1.0
            } else if diff <= -300 {
                0.0
            } else {
                0.5
            }
        }
        _ => 0.5,
    }
}

#[test]
fn level_2000_beats_level_400() {
    // Reduced budgets keep this quick in debug builds; the gap between depth 1
    // with heavy noise and depth 3+ with none is still large.
    let weak = cheap(400, 20_000);
    let strong = Strength {
        depth: 3,
        node_budget: 8_000,
        ..Strength::from_elo(2000)
    };
    let mut strong_points = 0.0;
    let games = 6;
    for i in 0..games {
        if i % 2 == 0 {
            strong_points += 1.0 - play(&weak, &strong, 100 + i, 140);
        } else {
            strong_points += play(&strong, &weak, 100 + i, 140);
        }
    }
    eprintln!("strong scored {strong_points}/{games}");
    assert!(
        strong_points >= 5.0,
        "level 2000 scored only {strong_points}/{games}"
    );
}
