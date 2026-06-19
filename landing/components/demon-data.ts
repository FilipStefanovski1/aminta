export interface DemonSkin {
  body: string;
  horn: string;
  eye: string;
}

export interface DemonLevel {
  lv: number;
  name: string;
  xp: number;
  skin: DemonSkin;
}

// Skins sweep cool → hot as Aminta grows: mint → cyan → blue → purple → pink → red.
// Matches the extension FORMS so the companion looks identical across surfaces.
export const LEVELS: DemonLevel[] = [
  { lv: 1, name: "Dormant",     xp: 0,    skin: { body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5" } },
  { lv: 2, name: "Curious",     xp: 150,  skin: { body: "#14564a", horn: "#0c3a32", eye: "#5ff0d8" } },
  { lv: 3, name: "Happy",       xp: 400,  skin: { body: "#134a66", horn: "#0c3247", eye: "#7ad0ff" } },
  { lv: 4, name: "Excited",     xp: 800,  skin: { body: "#2a3a7a", horn: "#1a2550", eye: "#9db0ff" } },
  { lv: 5, name: "Mischievous", xp: 1400, skin: { body: "#4a2a80", horn: "#301a55", eye: "#c8a8ff" } },
  { lv: 6, name: "Confident",   xp: 2200, skin: { body: "#66248a", horn: "#45185f", eye: "#e8a8ff" } },
  { lv: 7, name: "Guardian",    xp: 3200, skin: { body: "#8a2470", horn: "#5f1850", eye: "#ffa8e0" } },
  { lv: 8, name: "Mythic",      xp: 4500, skin: { body: "#8a2440", horn: "#5f1830", eye: "#ffa8b8" } },
  { lv: 9, name: "Ascended",    xp: 6000, skin: { body: "#8a2424", horn: "#5f1818", eye: "#ffa8a8" } },
];

export const MAX_XP = LEVELS[LEVELS.length - 1].xp;

export interface XpReward {
  label: string;
  xp: number;
  color: string;
}

export const XP_REWARDS: XpReward[] = [
  { label: "Tweet", xp: 50, color: "#2bff88" },
  { label: "Reply", xp: 25, color: "#a855f7" },
  { label: "Polish", xp: 15, color: "#38bdf8" },
  { label: "Thread", xp: 75, color: "#ff3b5c" },
  { label: "Daily Streak", xp: 100, color: "#f5b50a" },
];

export function levelForXp(xp: number): DemonLevel {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.xp) current = lvl;
  }
  return current;
}

export function nextLevelForXp(xp: number): DemonLevel | null {
  const current = levelForXp(xp);
  return LEVELS.find((l) => l.lv === current.lv + 1) ?? null;
}
