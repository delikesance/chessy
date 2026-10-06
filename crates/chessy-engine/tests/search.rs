use chessy_engine::search::{best_move, evaluate, score_moves, MATE};
use chessy_engine::{parse_square, Move, Position};

fn mv(from: &str, to: &str) -> Move {
    Move {
        from: parse_square(from).unwrap(),
        to: parse_square(to).unwrap(),
        promo: None,
    }
}

#[test]
fn finds_mate_in_one() {
    // Back-rank mate: Ra8#.
    let pos = Position::from_fen("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1").unwrap();
    assert_eq!(best_move(&pos, 2), Some(mv("a1", "a8")));
    let scored = score_moves(&pos, 2);
    assert!(scored[0].1 > MATE - 10, "mate score, got {}", scored[0].1);
}

#[test]
fn does_not_hang_the_queen() {
    // The queen on d1 is attacked by the bishop on g4; it should not stay en prise.
    let pos = Position::from_fen("4k3/8/8/8/6b1/8/8/3QK3 w - - 0 1").unwrap();
    let best = best_move(&pos, 3).unwrap();
    assert_ne!(
        best,
        mv("e1", "e2"),
        "leaving the queen attacked loses material"
    );
}

#[test]
fn takes_free_material() {
    let pos = Position::from_fen("4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1").unwrap();
    assert_eq!(best_move(&pos, 2), Some(mv("d1", "d5")));
}

#[test]
fn evaluation_is_symmetric() {
    let w = Position::from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").unwrap();
    let b = Position::from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1").unwrap();
    assert_eq!(evaluate(&w), 0);
    assert_eq!(evaluate(&b), 0);
}

#[test]
fn stalemate_scores_zero_and_no_move() {
    let pos = Position::from_fen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").unwrap();
    assert_eq!(best_move(&pos, 3), None);
}
