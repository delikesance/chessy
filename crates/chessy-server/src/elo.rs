//! Elo ratings: pure arithmetic, no I/O.

pub const START_ELO: i32 = 1200;
pub const ELO_FLOOR: i32 = 100;
/// Rated games during which a player is "provisional" and moves faster.
pub const PROVISIONAL_GAMES: u32 = 30;

/// K is 40 for a player's first 30 rated games, then 20.
/// `games_before` counts the rated games played before this one.
pub fn k_factor(games_before: u32) -> f64 {
    if games_before < PROVISIONAL_GAMES {
        40.0
    } else {
        20.0
    }
}

/// Expected score of a player rated `ra` against one rated `rb`.
pub fn expected_score(ra: i32, rb: i32) -> f64 {
    1.0 / (1.0 + 10f64.powf(f64::from(rb - ra) / 400.0))
}

/// New rating after one game; `score` is 1.0 (win), 0.5 (draw) or 0.0 (loss).
pub fn new_rating(ra: i32, rb: i32, score: f64, games_before: u32) -> i32 {
    let delta = k_factor(games_before) * (score - expected_score(ra, rb));
    ((f64::from(ra) + delta).round() as i32).max(ELO_FLOOR)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equal_ratings_split_k_evenly() {
        assert_eq!(new_rating(1200, 1200, 1.0, 0), 1220);
        assert_eq!(new_rating(1200, 1200, 0.0, 0), 1180);
        assert_eq!(new_rating(1200, 1200, 0.5, 0), 1200);
        assert_eq!(new_rating(1200, 1200, 1.0, 30), 1210);
    }

    #[test]
    fn k_drops_after_thirty_games() {
        assert_eq!(k_factor(0), 40.0);
        assert_eq!(k_factor(29), 40.0);
        assert_eq!(k_factor(30), 20.0);
    }

    #[test]
    fn upsets_and_favourites() {
        // E = 0.7597: the favourite gains 40 * 0.2403 = 9.6 -> 10; the loser of 1200 v 1400 drops 40 * 0.2403 -> 10.
        assert_eq!(new_rating(1400, 1200, 1.0, 0), 1410);
        assert_eq!(new_rating(1200, 1400, 0.0, 0), 1200 - 10);
        // The underdog's win is worth more.
        assert_eq!(new_rating(1200, 1400, 1.0, 0), 1200 + 30);
    }

    #[test]
    fn floor_holds() {
        assert_eq!(new_rating(100, 1200, 0.0, 0), 100);
        assert_eq!(new_rating(105, 105, 0.0, 0), 100);
    }
}
