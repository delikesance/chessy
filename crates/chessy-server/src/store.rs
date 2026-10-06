//! SQLite persistence: players, their skill decks, unique-skill ownership and
//! a log of finished games.

use std::sync::{Arc, Mutex};

use chessy_engine::{Outcome, SkillId, SkillKind};
use rand::seq::IndexedRandom;
use rusqlite::{params, Connection, OptionalExtension};
use thiserror::Error;

use crate::protocol::PlayerId;

pub const STARTER_DECK_SIZE: usize = 3;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("{0}")]
    Invalid(&'static str),
}

pub type StoreResult<T> = Result<T, StoreError>;

fn skill_name(skill: SkillId) -> String {
    serde_json::to_value(skill)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .expect("skills serialize to strings")
}

fn parse_skill(name: &str) -> Option<SkillId> {
    serde_json::from_value(serde_json::Value::String(name.to_owned())).ok()
}

fn random_hex(bytes: usize) -> String {
    (0..bytes)
        .map(|_| format!("{:02x}", rand::random::<u8>()))
        .collect()
}

pub fn classic_skills() -> Vec<SkillId> {
    SkillId::ALL
        .into_iter()
        .filter(|s| s.kind() == SkillKind::Classic)
        .collect()
}

/// Cheap to clone: clones share one connection.
#[derive(Clone)]
pub struct Store {
    conn: Arc<Mutex<Connection>>,
}

impl Store {
    /// Opens (creating if needed) the database at `path`; `":memory:"` works for tests.
    pub fn open(path: &str) -> StoreResult<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS players (
                 id TEXT PRIMARY KEY,
                 token TEXT NOT NULL UNIQUE,
                 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
             );
             CREATE TABLE IF NOT EXISTS player_skills (
                 player_id TEXT NOT NULL REFERENCES players(id),
                 skill TEXT NOT NULL,
                 PRIMARY KEY (player_id, skill)
             );
             CREATE TABLE IF NOT EXISTS unique_skill_owner (
                 skill TEXT PRIMARY KEY,
                 player_id TEXT NOT NULL REFERENCES players(id)
             );
             CREATE TABLE IF NOT EXISTS games (
                 id TEXT PRIMARY KEY,
                 white TEXT NOT NULL REFERENCES players(id),
                 black TEXT NOT NULL REFERENCES players(id),
                 outcome TEXT NOT NULL,
                 finished_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
             );",
        )?;
        Ok(Store {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Creates a player holding a starter deck of random classic skills.
    pub fn create_player(&self) -> StoreResult<(PlayerId, String)> {
        let id = random_hex(8);
        let token = random_hex(16);
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO players (id, token) VALUES (?1, ?2)",
            params![id, token],
        )?;
        let pool = classic_skills();
        let mut rng = rand::rng();
        for skill in pool.sample(&mut rng, STARTER_DECK_SIZE) {
            tx.execute(
                "INSERT INTO player_skills (player_id, skill) VALUES (?1, ?2)",
                params![id, skill_name(*skill)],
            )?;
        }
        tx.commit()?;
        Ok((id, token))
    }

    pub fn player_by_token(&self, token: &str) -> StoreResult<Option<PlayerId>> {
        let conn = self.conn.lock().unwrap();
        Ok(conn
            .query_row(
                "SELECT id FROM players WHERE token = ?1",
                params![token],
                |r| r.get(0),
            )
            .optional()?)
    }

    pub fn deck(&self, player: &str) -> StoreResult<Vec<SkillId>> {
        let conn = self.conn.lock().unwrap();
        deck_of(&conn, player)
    }

    pub fn unique_owner(&self, skill: SkillId) -> StoreResult<Option<PlayerId>> {
        let conn = self.conn.lock().unwrap();
        Ok(conn
            .query_row(
                "SELECT player_id FROM unique_skill_owner WHERE skill = ?1",
                params![skill_name(skill)],
                |r| r.get(0),
            )
            .optional()?)
    }

    pub fn record_game(
        &self,
        id: &str,
        white: &str,
        black: &str,
        outcome: &Outcome,
    ) -> StoreResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO games (id, white, black, outcome) VALUES (?1, ?2, ?3, ?4)",
            params![id, white, black, serde_json::to_string(outcome).unwrap()],
        )?;
        Ok(())
    }

    /// Atomically changes decks after a game: the loser may lose a skill, the
    /// winner may drop one (to make room) and gain one. Unique-skill ownership
    /// follows the skills; a unique skill can only be gained if it is unowned
    /// or being taken from the loser.
    pub fn apply_reward(
        &self,
        winner: &str,
        loser: &str,
        gain: Option<SkillId>,
        loser_loses: Option<SkillId>,
        winner_drops: Option<SkillId>,
    ) -> StoreResult<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let remove = |player: &str, skill: SkillId| -> StoreResult<()> {
            let name = skill_name(skill);
            let removed = tx.execute(
                "DELETE FROM player_skills WHERE player_id = ?1 AND skill = ?2",
                params![player, name],
            )?;
            if removed == 0 {
                return Err(StoreError::Invalid("player does not own that skill"));
            }
            tx.execute(
                "DELETE FROM unique_skill_owner WHERE skill = ?1 AND player_id = ?2",
                params![name, player],
            )?;
            Ok(())
        };
        if let Some(skill) = loser_loses {
            remove(loser, skill)?;
        }
        if let Some(skill) = winner_drops {
            remove(winner, skill)?;
        }
        if let Some(skill) = gain {
            let name = skill_name(skill);
            tx.execute(
                "INSERT INTO player_skills (player_id, skill) VALUES (?1, ?2)",
                params![winner, name],
            )?;
            if skill.kind() == SkillKind::Unique {
                // Fails on the primary key if someone else still owns it.
                tx.execute(
                    "INSERT INTO unique_skill_owner (skill, player_id) VALUES (?1, ?2)",
                    params![name, winner],
                )?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Replaces a player's whole deck. Fails, changing nothing, if a unique
    /// skill in `skills` belongs to someone else.
    pub fn set_deck(&self, player: &str, skills: &[SkillId]) -> StoreResult<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM player_skills WHERE player_id = ?1",
            params![player],
        )?;
        tx.execute(
            "DELETE FROM unique_skill_owner WHERE player_id = ?1",
            params![player],
        )?;
        for &skill in skills {
            let name = skill_name(skill);
            tx.execute(
                "INSERT INTO player_skills (player_id, skill) VALUES (?1, ?2)",
                params![player, name],
            )?;
            if skill.kind() == SkillKind::Unique {
                tx.execute(
                    "INSERT INTO unique_skill_owner (skill, player_id) VALUES (?1, ?2)",
                    params![name, player],
                )?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// A player left with no skills gets one random classic skill.
    pub fn refill_if_empty(&self, player: &str) -> StoreResult<()> {
        let conn = self.conn.lock().unwrap();
        if !deck_of(&conn, player)?.is_empty() {
            return Ok(());
        }
        let pool = classic_skills();
        let skill = pool
            .choose(&mut rand::rng())
            .copied()
            .ok_or(StoreError::Invalid("no classic skills"))?;
        conn.execute(
            "INSERT INTO player_skills (player_id, skill) VALUES (?1, ?2)",
            params![player, skill_name(skill)],
        )?;
        Ok(())
    }
}

fn deck_of(conn: &Connection, player: &str) -> StoreResult<Vec<SkillId>> {
    let mut stmt =
        conn.prepare("SELECT skill FROM player_skills WHERE player_id = ?1 ORDER BY rowid")?;
    let names = stmt.query_map(params![player], |r| r.get::<_, String>(0))?;
    let mut deck = Vec::new();
    for name in names {
        if let Some(skill) = parse_skill(&name?) {
            deck.push(skill);
        }
    }
    Ok(deck)
}
