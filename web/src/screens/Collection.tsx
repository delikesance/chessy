import { useEffect, useMemo, useRef, useState } from "react";
import { FAMILIES, FAMILY_LABEL, familyVar } from "../catalog";
import type { CatalogEntry } from "../catalog";
import { useAppState } from "../store";
import { SkillArt } from "../ui/SkillArt";
import { CLASSIC_NOTE, filterCatalog, RULES, UNIQUE_NOTE } from "./collectionData";
import type { FamilyFilter, KindFilter } from "./collectionData";
import "./collection.css";

const KINDS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "unique", label: "Uniques" },
  { id: "classic", label: "Classiques" },
];

export function Collection() {
  const { deck } = useAppState();
  const [family, setFamily] = useState<FamilyFilter>("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const list = useMemo(() => filterCatalog(family, kind), [family, kind]);
  const selected = list.find((c) => c.id === selectedId) ?? null;
  const inDeck = useMemo(() => new Set<string>(deck), [deck]);
  const total = filterCatalog("all", "all").length;

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <main className="co-page">
      <header className="co-head">
        <div>
          <p className="eyebrow">Encyclopédie</p>
          <h1 className="co-title">Compétences</h1>
          <p className="co-lead muted">
            {total} compétences à découvrir. Vous en gagnez en remportant des parties ; votre deck en contient 7 au maximum.
          </p>
        </div>
      </header>

      <div className="co-filters">
        <div className="co-chips" role="group" aria-label="Filtrer par famille">
          <button type="button" className="co-chip" aria-pressed={family === "all"} onClick={() => setFamily("all")}>
            Toutes les familles
          </button>
          {FAMILIES.map((f) => (
            <button key={f} type="button" className="co-chip" aria-pressed={family === f} onClick={() => setFamily(f)}>
              <span className="co-dot" style={{ background: familyVar(f) }} aria-hidden="true" />
              {FAMILY_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="seg co-kind" role="group" aria-label="Filtrer par type">
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <p className="co-count mono" aria-live="polite">
        {list.length} / {total}
      </p>

      <div className={`co-layout${selected ? " has-detail" : ""}`}>
        {list.length === 0 ? (
          <p className="co-empty card">Aucune compétence ne correspond à ces filtres.</p>
        ) : (
          <ul className="co-grid">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`co-card${selected?.id === c.id ? " on" : ""}`}
                  style={{ ["--fam" as string]: familyVar(c.family) }}
                  aria-pressed={selected?.id === c.id}
                  onClick={() => {
                    setSelectedId(c.id);
                    panelRef.current?.focus({ preventScroll: true });
                  }}
                >
                  <span className="co-art">
                    <SkillArt id={c.id} size={76} />
                  </span>
                  <span className="co-card-body">
                    <span className="co-name">{c.name}</span>
                    <span className="co-fam">{FAMILY_LABEL[c.family]}</span>
                    <span className="co-desc">{c.description}</span>
                  </span>
                  <span className="co-marks">
                    {c.unique && <span className="tag">Unique</span>}
                    {!c.implemented && <span className="tag co-soon">Bientôt jouable</span>}
                    {inDeck.has(c.id) && <span className="tag co-deck">Dans votre deck</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <aside
          ref={panelRef}
          tabIndex={-1}
          className="co-detail card"
          aria-label="Détail de la compétence"
          aria-live="polite"
        >
          {selected ? <Detail entry={selected} owned={inDeck.has(selected.id)} onClose={() => setSelectedId(null)} /> : <Placeholder />}
        </aside>
      </div>
    </main>
  );
}

function Placeholder() {
  return <p className="muted co-placeholder">Sélectionnez une compétence pour lire ses règles complètes.</p>;
}

function Detail({ entry: c, owned, onClose }: { entry: CatalogEntry; owned: boolean; onClose: () => void }) {
  return (
    <div className="co-detail-in" style={{ ["--fam" as string]: familyVar(c.family) }}>
      <button type="button" className="co-close btn sm ghost" onClick={onClose}>
        Fermer
      </button>
      <div className="co-detail-art">
        <SkillArt id={c.id} size={150} />
      </div>
      <p className="eyebrow co-detail-fam">{FAMILY_LABEL[c.family]}</p>
      <h2 className="co-detail-name">{c.name}</h2>
      <p className="co-marks">
        {c.unique ? <span className="tag">Unique</span> : <span className="tag">Classique</span>}
        {!c.implemented && <span className="tag co-soon">Bientôt jouable</span>}
        {owned && <span className="tag co-deck">Dans votre deck</span>}
      </p>
      <h3 className="co-sub">Règles</h3>
      <p className="co-rules">{RULES[c.id] ?? c.description}</p>
      <p className="co-note muted">{c.unique ? UNIQUE_NOTE : CLASSIC_NOTE}</p>
      {!c.implemented && (
        <p className="co-note muted">Cette compétence n'est pas encore disponible en partie : elle arrive dans une prochaine version.</p>
      )}
    </div>
  );
}
