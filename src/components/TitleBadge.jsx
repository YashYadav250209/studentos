import {
  Award, BookOpen, Circle, Crown, Flame, Gem, GraduationCap, LockKeyhole,
  ShieldCheck, Sparkles, Star, Users,
} from "lucide-react";
import { getRarityVisual, normalizeRarity, RARITY_CONFIG } from "../title-catalog";

const ICONS = { Award, BookOpen, Circle, Crown, Flame, Gem, GraduationCap, ShieldCheck, Sparkles, Star, Users };

export function RarityBadge({ rarity, theme = "dark", locked = false }) {
  const rarityName = normalizeRarity(rarity);
  const config = RARITY_CONFIG[rarityName];
  const Icon = locked ? LockKeyhole : ICONS[config.icon] || Star;

  return (
    <span
      className={`rarity-badge rarity-badge--${rarityName.toLowerCase()}${locked ? " rarity-badge--locked" : ""}`}
      style={getRarityVisual({ rarity: rarityName }, theme)}
      aria-label={`${locked ? "Locked " : ""}${config.name} rarity`}
    >
      <Icon size={11} strokeWidth={2.3} aria-hidden="true" />
      {config.name}
    </span>
  );
}

export function TitleBadge({ title, locked = false, ownerGranted = false, compact = false, theme = "dark" }) {
  if (!title) return null;
  const Icon = ICONS[title.icon] || Award;
  const ownerExclusive = title.ownerOnly || title.category === "owner-exclusive";
  const rarityName = normalizeRarity(title.rarity);

  return (
    <span
      className={`title-badge title-badge--${rarityName.toLowerCase()}${ownerExclusive ? " title-badge--owner" : ""}${locked ? " title-badge--locked" : ""}${compact ? " title-badge--compact" : ""}`}
      style={getRarityVisual(title, theme)}
      title={`${title.name}${title.subtitle ? ` · ${title.subtitle}` : ""}`}
    >
      <Icon size={compact ? 13 : 15} strokeWidth={2.2} aria-hidden="true" />
      <span>{title.name}</span>
      {ownerExclusive ? (
        <span className="title-badge__grant">OWNER · SOVEREIGN</span>
      ) : ownerGranted ? (
        <span className="title-badge__grant">OWNER GRANTED</span>
      ) : null}
    </span>
  );
}