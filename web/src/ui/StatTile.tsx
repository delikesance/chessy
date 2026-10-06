import type { ReactNode } from "react";
import "./stattile.css";

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
}

export function StatTile({ label, value, hint }: Props) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
