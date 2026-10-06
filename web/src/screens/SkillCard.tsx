import type { SkillId } from "../protocol";
import { SKILLS } from "../skills";

interface Props {
  skill: SkillId;
  selected?: boolean;
  disabled?: boolean;
  badge?: string;
  onClick?: () => void;
}

export function SkillCard({ skill, selected, disabled, badge, onClick }: Props) {
  const info = SKILLS[skill];
  const classes = ["skill-card", info.unique ? "unique" : "", selected ? "selected" : ""].join(" ");
  const content = (
    <>
      <span className="skill-name">
        {info.name}
        {info.unique && <em className="tag">unique</em>}
        {badge && <em className="tag muted">{badge}</em>}
      </span>
      <span className="skill-desc">{info.description}</span>
    </>
  );
  if (!onClick) return <div className={classes}>{content}</div>;
  return (
    <button type="button" className={classes} disabled={disabled} onClick={onClick} aria-pressed={selected}>
      {content}
    </button>
  );
}
