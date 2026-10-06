//! Iterative deepening, budgets, repetition and evaluation details.

use chessy_engine::search::{
    best_move, evaluate, is_mate_score, position_key, score_moves, search, search_with, Limits,
};
use chessy_engine::Position;

#[test]
fn deeper_search_finds_mate_in_two() {
    // Two rooks ladder the king: a mate in two exists.
    let pos = Position::from_fen("7k/8/8/8/8/8/R7/1R4K1 w - - 0 1").unwrap();
    let r = search(&pos, &Limits::depth(4));
    let (_, score) = r.best().unwrap();
    assert!(is_mate_score(score) && score > 0, "score {score}");
}

#[test]
fn avoids_being_mated_in_one() {
    // Black threatens a back-rank style mate; White must not allow mate in one.
    let pos = Position::from_fen("6k1/8/8/8/8/5q2/6P1/6K1 w - - 0 1").unwrap();
    let best = best_move(&pos, 3).unwrap();
    let mut next = pos.clone();
    next.make_move(best, &mut Vec::new());
    let reply_mates = next.legal_moves().into_iter().any(|m| {
        let mut n = next.clone();
        n.make_move(m, &mut Vec::new());
        n.legal_moves().is_empty() && n.in_check(n.side)
    });
    assert!(!reply_mates, "{best:?} allows mate in one");
}

#[test]
fn the_node_budget_is_respected_but_a_move_is_always_returned() {
    let pos = Position::startpos();
    let limits = Limits {
        nodes: 300,
        ..Limits::depth(8)
    };
    let r = search(&pos, &limits);
    assert!(r.best().is_some());
    assert!(r.depth >= 1 && r.depth < 8, "depth {}", r.depth);
    assert!(r.nodes < 5_000, "{} nodes for a 300 budget", r.nodes);
}

#[test]
fn a_stop_closure_ends_the_search_with_the_last_finished_iteration() {
    let pos = Position::startpos();
    let r = search_with(&pos, &Limits::depth(12), &[], &|| true);
    assert!(r.best().is_some());
    assert!(r.depth >= 1 && r.depth < 12, "depth {}", r.depth);
}

#[test]
fn search_is_deterministic() {
    let pos =
        Position::from_fen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1")
            .unwrap();
    let a = search(&pos, &Limits::depth(4));
    let b = search(&pos, &Limits::depth(4));
    assert_eq!(a.moves, b.moves);
    assert_eq!(a.nodes, b.nodes);
}

#[test]
fn positions_in_the_history_are_scored_as_draws() {
    // White is a queen up; but if every position it can reach was already
    // seen (and the fifty-move counter allows the rule to bite), all moves draw.
    let pos = Position::from_fen("7k/8/8/8/8/8/6Q1/K7 w - - 40 1").unwrap();
    let plain = search(&pos, &Limits::depth(1));
    assert!(plain.best().unwrap().1 > 500);
    let seen: Vec<u64> = pos
        .legal_moves()
        .into_iter()
        .map(|mv| {
            let mut n = pos.clone();
            n.make_move(mv, &mut Vec::new());
            position_key(&n)
        })
        .collect();
    let r = search_with(&pos, &Limits::depth(1), &seen, &|| false);
    assert!(r.moves.iter().all(|&(_, s)| s == 0), "{:?}", r.moves);
}

#[test]
fn insufficient_material_scores_zero() {
    let pos = Position::from_fen("8/8/8/4k3/8/8/3B4/K7 w - - 0 1").unwrap();
    let scored = score_moves(&pos, 3);
    assert!(scored.iter().all(|&(_, s)| s == 0), "{scored:?}");
}

#[test]
fn position_keys_distinguish_side_castling_and_en_passant() {
    let base = Position::from_fen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1").unwrap();
    let black = Position::from_fen("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1").unwrap();
    let no_rights = Position::from_fen("r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1").unwrap();
    assert_ne!(position_key(&base), position_key(&black));
    assert_ne!(position_key(&base), position_key(&no_rights));
    let ep_a = Position::from_fen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1").unwrap();
    let ep_b = Position::from_fen("4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1").unwrap();
    assert_ne!(position_key(&ep_a), position_key(&ep_b));
    assert_eq!(position_key(&base), position_key(&base.clone()));
}

#[test]
fn evaluation_prefers_the_better_structure() {
    // Doubled, isolated pawns are worse than a healthy chain of equal material.
    let healthy = Position::from_fen("4k3/8/8/8/8/8/PPP5/4K3 w - - 0 1").unwrap();
    let ugly = Position::from_fen("4k3/8/8/8/8/P7/P1P5/4K3 w - - 0 1").unwrap();
    assert!(evaluate(&healthy) > evaluate(&ugly));
}

#[test]
fn score_moves_orders_best_first_and_covers_every_legal_move() {
    let pos = Position::from_fen("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1").unwrap();
    let scored = score_moves(&pos, 3);
    assert_eq!(scored.len(), pos.legal_moves().len());
    assert!(scored.windows(2).all(|w| w[0].1 >= w[1].1));
}

#[test]
fn depth_three_stays_quick_on_a_busy_position() {
    // Mind Reading asks for depth 3 on live positions; even in a debug build
    // that must stay within seconds (the release target is 150 ms).
    let pos =
        Position::from_fen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1")
            .unwrap();
    let start = std::time::Instant::now();
    let _ = best_move(&pos, 3);
    let _ = score_moves(&pos, 3);
    assert!(start.elapsed() < std::time::Duration::from_secs(8));
}
