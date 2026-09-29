export const TITLE_CATEGORIES = [
  { id: "roles", label: "System Roles" },
  { id: "owner-exclusive", label: "Owner Exclusive" },
  { id: "inner-circle", label: "Inner Circle" },
  { id: "teacher", label: "Teacher Titles" },
  { id: "xp", label: "XP Titles" },
  { id: "perks", label: "Exclusive Perks" },
];

export const RARITY_ORDER = ["Common", "Rare", "Legendary", "Mythic", "Sovereign"];

export const RARITY_CONFIG = {
  Common: {
    name: "COMMON", icon: "Circle", lightColor: "#64748B", darkColor: "#CBD5E1",
    secondaryColor: "#64748B", darkSecondaryColor: "#CBD5E1",
    lightBorder: "rgba(100, 116, 139, 0.34)", darkBorder: "rgba(203, 213, 225, 0.3)",
    lightGlow: "rgba(100, 116, 139, 0.08)", darkGlow: "rgba(203, 213, 225, 0.1)",
    lightGradient: "radial-gradient(ellipse at 92% 0%, rgba(100, 116, 139, 0.055), transparent 54%)",
    darkGradient: "radial-gradient(ellipse at 92% 0%, rgba(203, 213, 225, 0.075), transparent 54%)",
  },
  Rare: {
    name: "RARE", icon: "Gem", lightColor: "#9333EA", darkColor: "#C084FC",
    secondaryColor: "#9333EA", darkSecondaryColor: "#C084FC",
    lightBorder: "rgba(147, 51, 234, 0.38)", darkBorder: "rgba(192, 132, 252, 0.42)",
    lightGlow: "rgba(147, 51, 234, 0.13)", darkGlow: "rgba(192, 132, 252, 0.2)",
    lightGradient: "radial-gradient(ellipse at 92% 0%, rgba(147, 51, 234, 0.075), transparent 56%)",
    darkGradient: "radial-gradient(ellipse at 92% 0%, rgba(192, 132, 252, 0.12), transparent 56%)",
  },
  Legendary: {
    name: "LEGENDARY", icon: "Award", lightColor: "#D97706", darkColor: "#FBBF24",
    secondaryColor: "#D97706", darkSecondaryColor: "#FBBF24",
    lightBorder: "rgba(217, 119, 6, 0.42)", darkBorder: "rgba(251, 191, 36, 0.48)",
    lightGlow: "rgba(217, 119, 6, 0.16)", darkGlow: "rgba(251, 191, 36, 0.22)",
    lightGradient: "radial-gradient(ellipse at 92% 0%, rgba(217, 119, 6, 0.075), transparent 54%)",
    darkGradient: "radial-gradient(ellipse at 92% 0%, rgba(251, 191, 36, 0.12), transparent 54%)",
  },
  Mythic: {
    name: "MYTHIC", icon: "Flame", lightColor: "#DC2626", darkColor: "#F87171",
    secondaryColor: "#DC2626", darkSecondaryColor: "#F87171",
    lightBorder: "rgba(220, 38, 38, 0.4)", darkBorder: "rgba(248, 113, 113, 0.48)",
    lightGlow: "rgba(220, 38, 38, 0.16)", darkGlow: "rgba(248, 113, 113, 0.24)",
    lightGradient: "radial-gradient(ellipse at 92% 0%, rgba(220, 38, 38, 0.075), transparent 56%)",
    darkGradient: "radial-gradient(ellipse at 92% 0%, rgba(248, 113, 113, 0.13), transparent 56%)",
  },
  Sovereign: {
    name: "SOVEREIGN", icon: "Crown", lightColor: "#BE123C", darkColor: "#FB7185",
    secondaryColor: "#D97706", darkSecondaryColor: "#FBBF24",
    lightBorder: "rgba(190, 18, 60, 0.48)", darkBorder: "rgba(251, 113, 133, 0.58)",
    lightGlow: "rgba(190, 18, 60, 0.18)", darkGlow: "rgba(251, 113, 133, 0.27)",
    lightGradient: "radial-gradient(ellipse at 92% 0%, rgba(217, 119, 6, 0.075), transparent 54%), radial-gradient(ellipse at 8% 100%, rgba(190, 18, 60, 0.065), transparent 52%)",
    darkGradient: "radial-gradient(ellipse at 92% 0%, rgba(251, 191, 36, 0.12), transparent 54%), radial-gradient(ellipse at 8% 100%, rgba(251, 113, 133, 0.11), transparent 52%)",
  },
};

export const OWNER_TITLE_STYLE = {
  lightColor: "#F59E0B", darkColor: "#FDE68A",
  highlightColor: "#FDE68A",
  secondaryColor: "#BE123C", darkSecondaryColor: "#BE123C",
  lightBorder: "rgba(245, 158, 11, 0.7)", darkBorder: "rgba(253, 230, 138, 0.76)",
  lightGlow: "rgba(190, 18, 60, 0.15)", darkGlow: "rgba(190, 18, 60, 0.27)",
  lightGradient: "radial-gradient(ellipse at 90% 0%, rgba(253, 230, 138, 0.12), transparent 55%), radial-gradient(ellipse at 5% 100%, rgba(190, 18, 60, 0.075), transparent 54%)",
  darkGradient: "radial-gradient(ellipse at 90% 0%, rgba(253, 230, 138, 0.13), transparent 55%), radial-gradient(ellipse at 5% 100%, rgba(190, 18, 60, 0.15), transparent 54%)",
};

const LEGACY_RARITIES = { Uncommon: "Rare", Epic: "Legendary", Exclusive: "Sovereign" };

export function normalizeRarity(rarity) {
  const legacyName = LEGACY_RARITIES[rarity];
  if (legacyName) return legacyName;
  const name = RARITY_ORDER.find((entry) => entry.toLowerCase() === String(rarity || "").toLowerCase());
  return name || "Common";
}

export function getRarityVisual(title, theme = "dark") {
  const dark = theme === "dark";
  const rarity = RARITY_CONFIG[normalizeRarity(title?.rarity)];
  const visual = title?.ownerOnly ? OWNER_TITLE_STYLE : rarity;
  const primary = dark ? visual.darkColor : visual.lightColor;
  const secondary = dark ? visual.darkSecondaryColor : visual.secondaryColor;
  return {
    "--rarity-color": primary,
    "--rarity-secondary": secondary,
    "--rarity-highlight": visual.highlightColor || secondary,
    "--rarity-border": dark ? visual.darkBorder : visual.lightBorder,
    "--rarity-glow": dark ? visual.darkGlow : visual.lightGlow,
    "--rarity-gradient": dark ? visual.darkGradient : visual.lightGradient,
    "--title-accent": primary,
  };
}

export const SYSTEM_ROLES = [
  { id: "student", label: "Student", icon: "GraduationCap", color: "#5B8DEF" },
  { id: "teacher", label: "Teacher", icon: "BookOpen", color: "#34C77B" },
  { id: "admin", label: "Admin", icon: "ShieldCheck", color: "#F2A93B" },
  { id: "owner", label: "Owner", icon: "Crown", color: "#F7C96B" },
];

export const DEFAULT_TITLES = [
  {
    id: "architect", name: "THE HONOURED ONE", subtitle: "The one who built StudentOS.",
    description: "The highest authority in the StudentOS ecosystem.", category: "owner-exclusive",
    rarity: "Sovereign", icon: "Crown", ownerOnly: true, manuallyGranted: true,
  },
  ...[
    ["founders-circle", "Founder’s Circle", "Recognized by the founder.", "Legendary"],
    ["inner-circle", "Inner Circle", "A trusted member of the StudentOS community.", "Mythic"],
    ["trusted", "Trusted", "A trusted friend of the StudentOS community.", "Rare"],
    ["prime-member", "Prime Member", "A valued member of the early community.", "Legendary"],
    ["first-wave", "First Wave", "One of the earliest StudentOS supporters.", "Legendary"],
    ["og-member", "OG Member", "Part of the original StudentOS community.", "Mythic"],
  ].map(([id, name, description, rarity]) => ({
    id, name, description, category: "inner-circle", rarity,
    icon: "Users", manuallyGranted: true, ownerGranted: true,
  })),
  ...[
    ["founders-mentor", "Founder’s Mentor", "Trusted educator within the StudentOS ecosystem.", "Rare"],
    ["master-mentor", "Master Mentor", "A teacher who makes difficult ideas click.", "Mythic"],
    ["elite-educator", "Elite Educator", "Recognized for exceptional teaching.", "Legendary"],
    ["academic-mentor", "Academic Mentor", "A steady guide through academic challenges.", "Rare"],
    ["os-mentor", "OS Mentor", "A dedicated mentor within StudentOS.", "Legendary"],
    ["faculty-prime", "Faculty Prime", "A leading educator in the StudentOS community.", "Mythic"],
  ].map(([id, name, description, rarity]) => ({
    id, name, description, category: "teacher", rarity,
    icon: "GraduationCap", manuallyGranted: true,
  })),
  ...[
    ["rookie", "Rookie", 100, "Common", "A first milestone on the learning path."],
    ["rising-student", "Rising Student", 500, "Rare", "Your effort is turning into momentum."],
    ["focused", "Focused", 1000, "Rare", "Consistency is sharpening your focus."],
    ["dedicated", "Dedicated", 2500, "Legendary", "You keep showing up and doing the work."],
    ["scholar", "Scholar", 5000, "Legendary", "A serious commitment to learning."],
    ["elite-scholar", "Elite Scholar", 10000, "Legendary", "Your dedication stands out."],
    ["mastermind", "Mastermind", 25000, "Mythic", "Exceptional focus across the long game."],
    ["grand-scholar", "Grand Scholar", 50000, "Mythic", "An extraordinary body of focused work."],
    ["legend", "Legend", 100000, "Sovereign", "A landmark achievement in StudentOS."],
  ].map(([id, name, xpRequired, rarity, description]) => ({
    id, name, xpRequired, description, category: "xp", rarity,
    icon: "Sparkles", manuallyGranted: false,
  })),
  ...[
    ["pioneer", "Pioneer", "Early StudentOS supporter.", "Rare"],
    ["beta-tester", "Beta Tester", "Helped test StudentOS before public release.", "Rare"],
    ["founding-student", "Founding Student", "Joined during the founding phase.", "Legendary"],
    ["community-builder", "Community Builder", "Recognized for helping grow the community.", "Legendary"],
    ["insider", "Insider", "Granted access to special StudentOS experiences.", "Mythic"],
    ["vip", "VIP", "Special access title granted manually.", "Sovereign"],
  ].map(([id, name, description, rarity]) => ({
    id, name, description, category: "perks", rarity,
    icon: "Sparkles", manuallyGranted: true,
  })),
];

export const ROLE_IDS = SYSTEM_ROLES.map((role) => role.id);

export function isTitleUnlocked(title, { role, xp = 0, grantedTitleIds = [] }) {
  if (!title) return false;
  if (title.ownerOnly || title.category === "owner-exclusive") return role === "owner";
  if (title.category === "xp" && !title.manuallyGranted) return xp >= (title.xpRequired || 0);
  if (role === "teacher" && title.id === "founders-mentor") return true;
  return grantedTitleIds.includes(title.id);
}