use chessy_engine::Position;

fn check(fen: &str, expected: &[u64]) {
    let pos = Position::from_fen(fen).unwrap();
    for (i, &nodes) in expected.iter().enumerate() {
        let depth = i as u32 + 1;
        assert_eq!(pos.perft(depth), nodes, "{fen} at depth {depth}");
    }
}

#[test]
fn startpos() {
    check(chessy_engine::START_FEN, &[20, 400, 8_902, 197_281]);
}

#[test]
fn kiwipete() {
    check(
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
        &[48, 2_039, 97_862],
    );
}

#[test]
fn rook_endgame_with_en_passant_pins() {
    check(
        "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
        &[14, 191, 2_812, 43_238],
    );
}

#[test]
fn promotions_and_castling_through_check() {
    check(
        "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
        &[6, 264, 9_467],
    );
}

#[test]
fn promotion_into_check() {
    check(
        "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
        &[44, 1_486, 62_379],
    );
}

/// Deeper reference counts; slow in debug builds.
/// Run with `cargo test --release -- --ignored`.
#[test]
#[ignore]
fn deep() {
    check(
        chessy_engine::START_FEN,
        &[20, 400, 8_902, 197_281, 4_865_609],
    );
    check(
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
        &[48, 2_039, 97_862, 4_085_603],
    );
    check(
        "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
        &[6, 264, 9_467, 422_333],
    );
}

#[test]
fn fen_round_trip() {
    for fen in [
        chessy_engine::START_FEN,
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
        "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 b - - 3 40",
    ] {
        assert_eq!(Position::from_fen(fen).unwrap().to_fen(), fen);
    }
}

#[test]
fn rejects_bad_fen() {
    assert!(Position::from_fen("not a fen").is_err());
    assert!(Position::from_fen("8/8/8/8/8/8/8 w - - 0 1").is_err());
}
