//! The AI must stay legal and panic-free when both sides carry any of the 27 skills.

use chessy_engine::ai::{choose_action, Rng, Strength};
use chessy_engine::{Action, Game, SkillId, SkillKind};

fn random_deck(rng: &mut Rng) -> Vec<SkillId> {
    let mut pool: Vec<SkillId> = SkillId::ALL
        .into_iter()
        .filter(|s| s.kind() == SkillKind::Classic)
        .collect();
    let mut deck = Vec::new();
    for _ in 0..3 {
        let i = rng.below(pool.len() as u64) as usize;
        deck.push(pool.swap_remove(i));
    }
    // Sometimes also hold a unique skill.
    let uniques: Vec<SkillId> = SkillId::ALL
        .into_iter()
        .filter(|s| s.kind() == SkillKind::Unique)
        .collect();
    if rng.chance(500) {
        deck.push(uniques[rng.below(uniques.len() as u64) as usize]);
    }
    deck
}

#[test]
fn ai_only_plays_legal_actions_with_every_skill_in_play() {
    let mut rng = Rng::new(7);
    let weak = Strength::from_elo(800);
    let mid = Strength::from_elo(1400);
    let mut skills_played = 0;
    for game_no in 0..24u64 {
        let white = random_deck(&mut rng);
        let black = random_deck(&mut rng);
        let mut game = Game::new(&white, &black);
        for ply in 0..80u64 {
            if game.outcome().is_over() {
                break;
            }
            let strength = if game.side_to_move() == chessy_engine::Color::White {
                &weak
            } else {
                &mid
            };
            let Some(action) = choose_action(&game, strength, game_no * 1000 + ply) else {
                break;
            };
            assert!(
                game.legal_actions().contains(&action),
                "game {game_no} ply {ply}: AI chose an illegal action {action:?}"
            );
            if matches!(action, Action::Skill { .. }) {
                skills_played += 1;
            }
            game.apply(action)
                .unwrap_or_else(|e| panic!("game {game_no} ply {ply}: {e}"));
        }
    }
    assert!(skills_played > 0, "the AI never used a skill in 24 games");
}
