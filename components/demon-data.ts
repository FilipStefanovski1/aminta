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

export const LEVELS: DemonLevel[] = [
  { lv: 1, name: "Dormant",     xp: 0,    skin: { body: "#2d3a48", horn: "#1a2230", eye: "#6dbfa0" } },
  { lv: 2, name: "Curious",     xp: 150,  skin: { body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5" } },
  { lv: 3, name: "Red",         xp: 400,  skin: { body: "#7d1a1a", horn: "#4a0f0f", eye: "#ff5555" } },
  { lv: 4, name: "Excited",     xp: 800,  skin: { body: "#0cb889", horn: "#087d5e", eye: "#c8fff0" } },
  { lv: 5, name: "Mischievous", xp: 1400, skin: { body: "#06d0a8", horn: "#04906e", eye: "#ffffff" } },
  { lv: 6, name: "Confident",   xp: 2200, skin: { body: "#00dcc0", horn: "#009e88", eye: "#ffffff" } },
  { lv: 7, name: "Guardian",    xp: 3200, skin: { body: "#c4f8ea", horn: "#74f7b5", eye: "#0a2a20" } },
  { lv: 8, name: "Mythic",      xp: 4500, skin: { body: "#e8fff8", horn: "#a0ffd6", eye: "#082018" } },
  { lv: 9, name: "Ascended",    xp: 6000, skin: { body: "#fffff0", horn: "#f5d060", eye: "#806000" } },
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
