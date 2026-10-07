//! The forged skills known to this process, by database id.
//!
//! The server loads every stored definition at start-up and registers new ones
//! as they are forged. A definition is immutable once registered, so entries
//! are leaked to hand out the `&'static dyn Skill` the engine expects; there is
//! one per forged skill, no matter how many times it is registered.

use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

use super::composite::Composite;
use super::def::{DefError, SkillDef};
use super::identity;
use crate::position::Position;
use crate::skills::{Skill, SkillId, SkillTarget};
use crate::types::{Color, Event};

type Table = RwLock<HashMap<u32, &'static Composite>>;

fn table() -> &'static Table {
    static TABLE: OnceLock<Table> = OnceLock::new();
    TABLE.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Registers `def` under `id`. Registering the same definition again is fine;
/// a different one under a known id is refused.
pub fn register(id: u32, def: SkillDef) -> Result<(), DefError> {
    def.validate()?;
    let def = def.canonical();
    let mut table = table().write().expect("forge registry lock");
    if let Some(known) = table.get(&id) {
        return if known.def == def {
            Ok(())
        } else {
            Err(DefError::Conflict(id))
        };
    }
    let name: &'static str = Box::leak(identity::identity(&def).name.into_boxed_str());
    let skill: &'static Composite = Box::leak(Box::new(Composite {
        id: SkillId::Forged(id),
        def,
        name,
    }));
    table.insert(id, skill);
    Ok(())
}

/// What a forged id resolves to when nothing was registered under it (a stale
/// replay, say): a skill with no targets, so it can never be played.
struct Unknown;

impl Skill for Unknown {
    fn id(&self) -> SkillId {
        SkillId::Forged(u32::MAX)
    }
    fn targets(&self, _: &Position, _: Color) -> Vec<SkillTarget> {
        Vec::new()
    }
    fn apply(&self, _: &mut Position, _: Color, _: SkillTarget, _: &mut Vec<Event>) {}
}

static UNKNOWN: Unknown = Unknown;

fn lookup(id: u32) -> Option<&'static Composite> {
    table()
        .read()
        .expect("forge registry lock")
        .get(&id)
        .copied()
}

pub fn get(id: u32) -> &'static dyn Skill {
    match lookup(id) {
        Some(skill) => skill,
        None => &UNKNOWN,
    }
}

pub fn name(id: u32) -> &'static str {
    lookup(id).map_or("Unknown skill", |s| s.name)
}

pub fn def(id: u32) -> Option<&'static SkillDef> {
    lookup(id).map(|s| &s.def)
}

pub fn is_registered(id: u32) -> bool {
    lookup(id).is_some()
}
