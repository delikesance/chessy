use chessy_engine::analysis::{accuracy, label_for, Label};
use chessy_engine::notation::*;
use chessy_engine::*;

fn s(name: &str) -> Square {
    parse_square(name).unwrap_or_else(|| panic!("bad square {name}"))
}

/// Notation of `from`→`to` in the position `fen`, checking the move is legal.
fn san(fen: &str, from: &str, to: &str, promo: Option<PieceKind>) -> String {
    let pos = Position::from_fen(fen).unwrap();
    let mv = Move {
        from: s(from),
        to: s(to),
        promo,
    };
    assert!(
        pos.legal_moves().contains(&mv),
        "{from}{to} is not legal in {fen}"
    );
    simulated_move_notation(&pos, mv)
}

#[test]
fn plain_moves_and_pawn_moves() {
    assert_eq!(san(START_FEN, "g1", "f3", None), "Cf3");
    assert_eq!(san(START_FEN, "e2", "e4", None), "e4");
    assert_eq!(san(START_FEN, "b1", "c3", None), "Cc3");
    // A king step and a quiet rook move.
    assert_eq!(
        san("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "e1", "e2", None),
        "Re2"
    );
    assert_eq!(
        san("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "a1", "a5", None),
        "Ta5"
    );
}

#[test]
fn captures_name_the_file_for_pawns_and_x_for_pieces() {
    let after_e4_d5 = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2";
    assert_eq!(san(after_e4_d5, "e4", "d5", None), "exd5");
    let queen = "4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1";
    assert_eq!(san(queen, "d1", "d5", None), "Dxd5");
    let knight = "4k3/8/8/3p4/8/2N5/8/4K3 w - - 0 1";
    assert_eq!(san(knight, "c3", "d5", None), "Cxd5");
}

#[test]
fn en_passant_reads_like_a_pawn_capture() {
    let fen = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1";
    assert_eq!(san(fen, "e5", "d6", None), "exd6");
}

#[test]
fn castling_is_o_o_and_o_o_o() {
    let white = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    assert_eq!(san(white, "e1", "g1", None), "O-O");
    assert_eq!(san(white, "e1", "c1", None), "O-O-O");
    let black = "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1";
    assert_eq!(san(black, "e8", "g8", None), "O-O");
    assert_eq!(san(black, "e8", "c8", None), "O-O-O");
    // Castling that gives check carries the sign (the rook lands on f1, f-file open).
    let check = "5k2/8/8/8/8/8/8/R3K2R w KQ - 0 1";
    assert_eq!(san(check, "e1", "g1", None), "O-O+");
}

#[test]
fn promotions_with_and_without_capture_and_check() {
    let quiet = "8/4P2k/8/8/8/8/8/K7 w - - 0 1";
    assert_eq!(san(quiet, "e7", "e8", Some(PieceKind::Queen)), "e8=D");
    assert_eq!(san(quiet, "e7", "e8", Some(PieceKind::Knight)), "e8=C");
    assert_eq!(san(quiet, "e7", "e8", Some(PieceKind::Rook)), "e8=T");
    assert_eq!(san(quiet, "e7", "e8", Some(PieceKind::Bishop)), "e8=F");
    // The new queen checks along the eighth rank.
    let check = "7k/4P3/8/8/8/8/8/K7 w - - 0 1";
    assert_eq!(san(check, "e7", "e8", Some(PieceKind::Queen)), "e8=D+");
    // Capture, promotion and check at once.
    let both = "3r3k/4P3/8/8/8/8/8/K7 w - - 0 1";
    assert_eq!(san(both, "e7", "d8", Some(PieceKind::Queen)), "exd8=D+");
    assert_eq!(san(both, "e7", "d8", Some(PieceKind::Knight)), "exd8=C");
}

#[test]
fn two_identical_pieces_are_told_apart_by_file_rank_or_both() {
    let files = "4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1";
    assert_eq!(san(files, "b1", "d2", None), "Cbd2");
    assert_eq!(san(files, "f3", "d2", None), "Cfd2");
    // Same file: the rank.
    let ranks = "4k3/8/8/R7/8/8/8/R3K3 w - - 0 1";
    assert_eq!(san(ranks, "a1", "a3", None), "T1a3");
    assert_eq!(san(ranks, "a5", "a3", None), "T5a3");
    // Three queens that can all reach c3: one shares the file, one the rank.
    let both = "8/8/8/7k/8/Q7/7K/Q1Q5 w - - 0 1";
    assert_eq!(san(both, "a1", "c3", None), "Da1c3");
    assert_eq!(san(both, "a3", "c3", None), "D3c3");
    assert_eq!(san(both, "c1", "c3", None), "Dcc3");
    // A pinned twin is not a rival: the knight on e2 cannot move.
    let pinned = "4r1k1/8/8/8/8/8/4N3/1N2K3 w - - 0 1";
    assert_eq!(san(pinned, "b1", "c3", None), "Cc3");
}

#[test]
fn check_and_checkmate_signs() {
    let check = "4k3/8/8/8/8/8/8/R3K3 w - - 0 1";
    assert_eq!(san(check, "a1", "a8", None), "Ta8+");
    // Fool's mate.
    let mut game = Game::new(&[], &[]);
    let mut last = None;
    for (from, to) in [("f2", "f3"), ("e7", "e5"), ("g2", "g4"), ("d8", "h4")] {
        let action = Action::Move {
            from: s(from),
            to: s(to),
            promo: None,
        };
        last = Some(simulated_action_notation(&game.pos, action));
        game.apply(action).unwrap();
    }
    assert_eq!(last.as_deref(), Some("Dh4#"));
    assert!(game.outcome().is_over());
}

#[test]
fn real_games_notate_from_the_events_they_produced() {
    // Mate, played through the game with its real events and outcome.
    let mut game = Game::new(&[], &[]);
    for (from, to) in [("f2", "f3"), ("e7", "e5"), ("g2", "g4")] {
        game.apply(Action::Move {
            from: s(from),
            to: s(to),
            promo: None,
        })
        .unwrap();
    }
    let before = game.pos.clone();
    let mv = Move {
        from: s("d8"),
        to: s("h4"),
        promo: None,
    };
    let events = game.apply(mv.into()).unwrap();
    assert_eq!(move_notation(&before, mv, &events, &game.pos, true), "Dh4#");
}

#[test]
fn skills_have_readable_lines() {
    let sq = |n: &str| s(n);
    assert_eq!(
        skill_notation(
            SkillId::Teleportation,
            SkillTarget::PieceTo {
                from: sq("e2"),
                to: sq("e4")
            }
        ),
        "Teleportation e2→e4"
    );
    assert_eq!(
        skill_notation(SkillId::Freeze, SkillTarget::Piece { square: sq("e5") }),
        "Freeze sur e5"
    );
    assert_eq!(
        skill_notation(SkillId::Tornado, SkillTarget::None),
        "Tornado"
    );
    assert_eq!(
        skill_notation(
            SkillId::DestinySwapper,
            SkillTarget::Pair {
                a: sq("b1"),
                b: sq("g1")
            }
        ),
        "Destiny Swapper b1↔g1"
    );
    assert_eq!(
        skill_notation(SkillId::Trap, SkillTarget::Square { square: sq("d4") }),
        "Trap Card sur d4"
    );
    assert_eq!(
        skill_notation(
            SkillId::Mirage,
            SkillTarget::Spawn {
                square: sq("f3"),
                kind: PieceKind::Knight
            }
        ),
        "Mirage sur f3 (Cavalier)"
    );
    // Every skill has a name.
    for id in SkillId::ALL {
        assert!(!skill_name(id).is_empty());
    }
}

#[test]
fn labels_follow_the_loss_thresholds() {
    assert_eq!(label_for(0, true), Label::Best);
    assert_eq!(label_for(10, false), Label::Best);
    assert_eq!(label_for(11, false), Label::Good);
    assert_eq!(label_for(50, false), Label::Good);
    assert_eq!(label_for(51, false), Label::Inaccuracy);
    assert_eq!(label_for(120, false), Label::Inaccuracy);
    assert_eq!(label_for(121, false), Label::Mistake);
    assert_eq!(label_for(300, false), Label::Mistake);
    assert_eq!(label_for(301, false), Label::Blunder);
    assert_eq!(label_for(4000, false), Label::Blunder);
    // The engine's own choice is best whatever the noise says.
    assert_eq!(label_for(80, true), Label::Best);
}

#[test]
fn accuracy_decays_with_the_mean_loss() {
    assert_eq!(accuracy(&[]), 100);
    assert_eq!(accuracy(&[0, 0, 0]), 100);
    // 100 · exp(-1) ≈ 36.8
    assert_eq!(accuracy(&[250]), 37);
    assert_eq!(accuracy(&[0, 500]), 37);
    assert_eq!(accuracy(&[25]), 90);
    assert!(accuracy(&[4000]) <= 1);
}
