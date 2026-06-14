import Reveal from "./Reveal";
import DemonMascot from "./DemonMascot";
import type { DemonSkin } from "./demon-data";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvolutionStage {
  lv: number;
  name: string;
  color: string;
  skin: DemonSkin;
}

interface RarityDef {
  label: string;
  color: string;
  border: string;
  bg: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const STAGES: EvolutionStage[] = [
  { lv: 1, name: "Dormant Aminta",     color: "#8ca0b0", skin: { body: "#2d3a48", horn: "#1a2230", eye: "#6dbfa0" } },
  { lv: 2, name: "Curious Aminta",     color: "#74f7b5", skin: { body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5" } },
  { lv: 3, name: "Happy Aminta",       color: "#40e898", skin: { body: "#169962", horn: "#0d6642", eye: "#9dffd0" } },
  { lv: 4, name: "Excited Aminta",     color: "#00c8a8", skin: { body: "#0cb889", horn: "#087d5e", eye: "#c8fff0" } },
  { lv: 5, name: "Mischievous Aminta", color: "#00e0c0", skin: { body: "#06d0a8", horn: "#04906e", eye: "#ffffff" } },
  { lv: 6, name: "Confident Aminta",   color: "#40b0ff", skin: { body: "#00dcc0", horn: "#009e88", eye: "#ffffff" } },
  { lv: 7, name: "Guardian Aminta",    color: "#74f7b5", skin: { body: "#c4f8ea", horn: "#74f7b5", eye: "#0a2a20" } },
  { lv: 8, name: "Mythic Aminta",      color: "#c0a0ff", skin: { body: "#e8fff8", horn: "#a0ffd6", eye: "#082018" } },
  { lv: 9, name: "Ascended Aminta",    color: "#f5d060", skin: { body: "#fffff0", horn: "#f5d060", eye: "#806000" } },
];

function rarityFor(lv: number): RarityDef {
  if (lv <= 2) return { label: "COMMON",    color: "#8ca0b0", border: "#1e2530", bg: "rgba(140,160,176,0.08)" };
  if (lv <= 4) return { label: "UNCOMMON",  color: "#74f7b5", border: "#1a3a28", bg: "rgba(116,247,181,0.08)" };
  if (lv <= 6) return { label: "RARE",      color: "#40b0ff", border: "#1a3050", bg: "rgba(64,176,255,0.08)"  };
  if (lv <= 8) return { label: "EPIC",      color: "#c0a0ff", border: "#30206a", bg: "rgba(192,160,255,0.08)" };
  return              { label: "LEGENDARY", color: "#f5d060", border: "#504010", bg: "rgba(245,208,96,0.09)"  };
}

const BG: Record<number, string> = {
  1: "linear-gradient(180deg,#1a2030 0%,#0d1520 65%,#0a0e15 100%)",
  2: "linear-gradient(180deg,#0a1820 0%,#0d2018 60%,#080e0a 100%)",
  3: "linear-gradient(180deg,#0a1a0a 0%,#0d200f 55%,#081008 100%)",
  4: "linear-gradient(180deg,#2a0f3d 0%,#1a0828 60%,#12051e 100%)",
  5: "linear-gradient(180deg,#180820 0%,#100518 60%,#08040f 100%)",
  6: "linear-gradient(180deg,#050d18 0%,#0a1828 60%,#020810 100%)",
  7: "linear-gradient(180deg,#0a0c18 0%,#0f0d20 55%,#070610 100%)",
  8: "linear-gradient(180deg,#08040f 0%,#100818 60%,#06030a 100%)",
  9: "linear-gradient(180deg,#18140a 0%,#120f04 55%,#0a0804 100%)",
};

// ─── Scene backgrounds ────────────────────────────────────────────────────────

function SceneElements({ lv }: { lv: number }) {
  switch (lv) {
    case 1:
      return (<>
        <circle cx="168" cy="22" r="13" fill="#c8d8e8" opacity={0.9}/>
        <circle cx="174" cy="16" r="11" fill="#0d1117"/>
        <circle cx="22"  cy="10" r="1"   fill="#c8d8e8" opacity={0.7}/>
        <circle cx="65"  cy="7"  r="1"   fill="#c8d8e8" opacity={0.5}/>
        <circle cx="102" cy="16" r="1.5" fill="#c8d8e8" opacity={0.6}/>
        <circle cx="135" cy="9"  r="1"   fill="#a8c0d0" opacity={0.8}/>
        <circle cx="48"  cy="28" r="1"   fill="#c8d8e8" opacity={0.4}/>
        <rect x="0" y="100" width="200" height="20" fill="#0a0e15"/>
        <rect x="0" y="98"  width="200" height="3"  fill="#142018"/>
        <ellipse cx="24"  cy="100" rx="14" ry="6" fill="#0f1c10"/>
        <ellipse cx="170" cy="100" rx="18" ry="7" fill="#0f1c10"/>
      </>);
    case 2:
      return (<>
        <circle cx="32" cy="18" r="12" fill="#c8e0d8" opacity={0.85}/>
        <circle cx="25" cy="13" r="10" fill="#0a1520"/>
        <polygon points="0,106 18,52 36,106"     fill="#0d2a14"/>
        <polygon points="168,106 184,46 200,106" fill="#0d2a14"/>
        <polygon points="4,106 20,60 36,106"     fill="#112e18"/>
        <rect x="0" y="106" width="200" height="14" fill="#080e0a"/>
        <rect x="0" y="103" width="200" height="4"  fill="#142814"/>
        <circle cx="70"  cy="72" r="1.5" fill="#74f7b5" opacity={0.9}/>
        <circle cx="110" cy="60" r="1.5" fill="#74f7b5" opacity={0.7}/>
        <circle cx="140" cy="82" r="1"   fill="#40e898" opacity={0.8}/>
        <circle cx="55"  cy="86" r="1"   fill="#74f7b5" opacity={0.6}/>
      </>);
    case 3:
      return (<>
        <circle cx="30"  cy="14" r="1.5" fill="#74f7b5" opacity={0.9}/>
        <circle cx="62"  cy="8"  r="1"   fill="#a8ffd2" opacity={0.7}/>
        <circle cx="92"  cy="20" r="1.5" fill="#74f7b5" opacity={0.8}/>
        <circle cx="150" cy="11" r="1"   fill="#40e898" opacity={0.9}/>
        <circle cx="176" cy="25" r="1.5" fill="#74f7b5" opacity={0.6}/>
        <polygon points="0,106 18,44 36,106"     fill="#0d3d10"/>
        <polygon points="168,106 184,40 200,106" fill="#0d3d10"/>
        <rect x="0" y="106" width="200" height="14" fill="#060e06"/>
        <rect x="0" y="103" width="200" height="4"  fill="#142814"/>
        <rect x="48" y="96" width="6" height="10" fill="#2d1a0a"/>
        <ellipse cx="51" cy="96" rx="11" ry="5" fill="#8b2020"/>
        <rect x="50" y="93" width="3" height="3" fill="#ff8080" opacity={0.4}/>
        <rect x="130" y="98" width="5" height="8" fill="#2d1a0a"/>
        <ellipse cx="132" cy="98" rx="8" ry="4" fill="#6b1818"/>
        <ellipse cx="90" cy="108" rx="16" ry="4" fill="#74f7b5" opacity={0.07}/>
      </>);
    case 4:
      return (<>
        <circle cx="165" cy="18" r="10" fill="#d8c8f0" opacity={0.7}/>
        <circle cx="171" cy="13" r="8"  fill="#1a0a2a"/>
        <circle cx="20"  cy="8"  r="1.5" fill="#d8c8f0" opacity={0.7}/>
        <circle cx="50"  cy="14" r="1"   fill="#e0d0ff" opacity={0.8}/>
        <circle cx="80"  cy="6"  r="1.5" fill="#d8c8f0" opacity={0.5}/>
        <circle cx="110" cy="18" r="1"   fill="#e0d0ff" opacity={0.9}/>
        <circle cx="140" cy="10" r="1.5" fill="#d8c8f0" opacity={0.6}/>
        <polygon points="0,120 35,48 70,120"    fill="#200840"/>
        <polygon points="38,120 80,30 122,120"  fill="#1a0638"/>
        <polygon points="100,120 145,42 190,120" fill="#200840"/>
        <polygon points="60,120 80,30 100,120"  fill="#280a48"/>
        <rect x="87" y="22" width="1" height="6" fill="#d8c8f0" opacity={0.4}/>
        <rect x="84" y="25" width="7" height="1" fill="#d8c8f0" opacity={0.4}/>
        <rect x="57" y="38" width="1" height="4" fill="#c8a8e8" opacity={0.5}/>
        <rect x="55" y="40" width="5" height="1" fill="#c8a8e8" opacity={0.5}/>
      </>);
    case 5:
      return (<>
        <circle cx="148" cy="16" r="11" fill="#c8b8e8" opacity={0.7}/>
        <circle cx="154" cy="11" r="9"  fill="#100a20"/>
        <circle cx="18"  cy="8"  r="1"   fill="#e0d4ff" opacity={0.9}/>
        <circle cx="60"  cy="14" r="1.5" fill="#d4c8f8" opacity={0.6}/>
        <circle cx="88"  cy="6"  r="1"   fill="#e0d4ff"/>
        <circle cx="180" cy="20" r="1"   fill="#d4c8f8" opacity={0.8}/>
        <rect x="0"   y="68" width="18" height="52" fill="#0f0820"/>
        <rect x="20"  y="50" width="24" height="70" fill="#0a0618"/>
        <rect x="26"  y="44" width="12" height="8"  fill="#0f0820"/>
        <rect x="68"  y="36" width="28" height="84" fill="#0a0618"/>
        <rect x="74"  y="30" width="16" height="8"  fill="#0f0820"/>
        <rect x="100" y="64" width="22" height="56" fill="#0f0820"/>
        <rect x="126" y="42" width="26" height="78" fill="#0a0618"/>
        <rect x="176" y="32" width="24" height="88" fill="#0a0618"/>
        <rect x="23" y="56" width="5" height="5" fill="#4a1a78" opacity={0.9}/>
        <rect x="31" y="56" width="5" height="5" fill="#3a1460" opacity={0.7}/>
        <rect x="71" y="40" width="6" height="5" fill="#4a1a78" opacity={0.9}/>
        <rect x="80" y="40" width="6" height="5" fill="#6020a0" opacity={0.7}/>
        <rect x="129" y="46" width="6" height="5" fill="#4a1a78" opacity={0.9}/>
        <rect x="138" y="46" width="6" height="5" fill="#5020a0" opacity={0.7}/>
        <rect x="0" y="105" width="200" height="15" fill="#080614"/>
      </>);
    case 6:
      return (<>
        <circle cx="20"  cy="12" r="1"   fill="#80c8ff" opacity={0.8}/>
        <circle cx="55"  cy="8"  r="1.5" fill="#60a8ff" opacity={0.6}/>
        <circle cx="85"  cy="18" r="1"   fill="#80c8ff" opacity={0.7}/>
        <circle cx="170" cy="10" r="1.5" fill="#60a8ff" opacity={0.9}/>
        <circle cx="190" cy="22" r="1"   fill="#80c8ff" opacity={0.6}/>
        <polygon points="0,106 16,60 32,106"     fill="#040c08"/>
        <polygon points="172,106 186,55 200,106" fill="#040c08"/>
        <ellipse cx="100" cy="107" rx="48" ry="8" fill="none" stroke="#0080ff" strokeWidth="1.5" opacity={0.9}/>
        <ellipse cx="100" cy="107" rx="36" ry="6" fill="none" stroke="#40a0ff" strokeWidth="1"   opacity={0.6}/>
        <ellipse cx="100" cy="107" rx="24" ry="4" fill="none" stroke="#80c0ff" strokeWidth="0.8" opacity={0.4}/>
        <rect x="45"  y="50" width="2"  height="12" fill="#0060c0" opacity={0.35}/>
        <rect x="38"  y="57" width="16" height="2"  fill="#0060c0" opacity={0.35}/>
        <rect x="152" y="48" width="2"  height="12" fill="#0060c0" opacity={0.35}/>
        <rect x="145" y="55" width="16" height="2"  fill="#0060c0" opacity={0.35}/>
        <circle cx="65"  cy="60" r="1.5" fill="#40a0ff" opacity={0.8}/>
        <circle cx="140" cy="55" r="1.5" fill="#60b0ff" opacity={0.7}/>
        <circle cx="78"  cy="40" r="1"   fill="#80c8ff" opacity={0.9}/>
        <circle cx="128" cy="45" r="1"   fill="#40a0ff" opacity={0.6}/>
        <rect x="0" y="108" width="200" height="12" fill="#020a14"/>
      </>);
    case 7:
      return (<>
        <circle cx="30" cy="22" r="12" fill="#c0b890" opacity={0.7}/>
        <circle cx="24" cy="17" r="10" fill="#08080f"/>
        <circle cx="80"  cy="8"  r="1.5" fill="#c8c0a0" opacity={0.7}/>
        <circle cx="130" cy="14" r="1"   fill="#d0c8a8" opacity={0.8}/>
        <circle cx="160" cy="6"  r="1.5" fill="#c8c0a0" opacity={0.5}/>
        <circle cx="190" cy="20" r="1"   fill="#d0c8a8" opacity={0.7}/>
        <rect x="10"  y="10" width="22" height="90" fill="#1a1408"/>
        <rect x="6"   y="6"  width="30" height="8"  fill="#2a2010"/>
        <rect x="6"   y="90" width="30" height="10" fill="#2a2010"/>
        <rect x="8"   y="14" width="5"  height="76" fill="#221c0a"/>
        <rect x="27"  y="14" width="5"  height="76" fill="#221c0a"/>
        <rect x="168" y="10" width="22" height="90" fill="#1a1408"/>
        <rect x="164" y="6"  width="30" height="8"  fill="#2a2010"/>
        <rect x="164" y="90" width="30" height="10" fill="#2a2010"/>
        <rect x="166" y="14" width="5"  height="76" fill="#221c0a"/>
        <rect x="185" y="14" width="5"  height="76" fill="#221c0a"/>
        <ellipse cx="100" cy="107" rx="44" ry="7" fill="none" stroke="#a07010" strokeWidth="2"   opacity={0.9}/>
        <ellipse cx="100" cy="107" rx="34" ry="5" fill="none" stroke="#c09020" strokeWidth="1.5" opacity={0.7}/>
        <ellipse cx="100" cy="107" rx="22" ry="3" fill="none" stroke="#f0c840" strokeWidth="1"   opacity={0.5}/>
        <rect x="0" y="108" width="200" height="12" fill="#0a0804"/>
      </>);
    case 8:
      return (<>
        <circle cx="35" cy="30" r="18" fill="#2a1040"/>
        <ellipse cx="35" cy="30" rx="30" ry="7" fill="none" stroke="#6a2a90" strokeWidth="2"   opacity={0.9}/>
        <ellipse cx="35" cy="30" rx="30" ry="7" fill="none" stroke="#8a40b0" strokeWidth="1"   opacity={0.4}/>
        <circle cx="172" cy="20" r="10" fill="#1a0830"/>
        <circle cx="80"  cy="10" r="1"   fill="#e0d0ff" opacity={0.9}/>
        <circle cx="110" cy="6"  r="1.5" fill="#ffffff"  opacity={0.8}/>
        <circle cx="140" cy="15" r="1"   fill="#e0d0ff" opacity={0.7}/>
        <circle cx="60"  cy="22" r="1"   fill="#ffffff"  opacity={0.6}/>
        <circle cx="158" cy="38" r="1.5" fill="#c0a0ff" opacity={0.8}/>
        <circle cx="188" cy="44" r="1"   fill="#e0d0ff" opacity={0.7}/>
        <circle cx="100" cy="98" r="30" fill="none" stroke="#6a20a0" strokeWidth="1.5" opacity={0.7}/>
        <circle cx="100" cy="98" r="22" fill="none" stroke="#8a30c0" strokeWidth="1"   opacity={0.5}/>
        <circle cx="100" cy="98" r="14" fill="none" stroke="#aa40e0" strokeWidth="0.8" opacity={0.4}/>
        <ellipse cx="120" cy="40" rx="30" ry="10" fill="#4a0880" opacity={0.12}/>
        <circle cx="150" cy="55" r="3" fill="#c0a0ff" opacity={0.8}/>
        <polygon points="153,55 153,53 192,38 192,40" fill="#8060c0" opacity={0.4}/>
        <rect x="0" y="110" width="200" height="10" fill="#050010"/>
      </>);
    case 9:
      return (<>
        <polygon points="88,0 112,0 132,60 68,60"   fill="#f5d060" opacity={0.04}/>
        <polygon points="95,0 105,0 118,50 82,50"   fill="#f5d060" opacity={0.07}/>
        <circle cx="50"  cy="10" r="1.5" fill="#f0e090" opacity={0.8}/>
        <circle cx="80"  cy="6"  r="1"   fill="#fff8d0" opacity={0.9}/>
        <circle cx="120" cy="14" r="1.5" fill="#f0e090" opacity={0.7}/>
        <circle cx="160" cy="8"  r="1"   fill="#fff8d0" opacity={0.8}/>
        <circle cx="185" cy="18" r="1"   fill="#f0e090" opacity={0.6}/>
        <rect x="8"   y="8"  width="22" height="92" fill="#1a1404"/>
        <rect x="4"   y="4"  width="30" height="10" fill="#2a2008"/>
        <rect x="4"   y="88" width="30" height="10" fill="#2a2008"/>
        <rect x="6"   y="14" width="5"  height="74" fill="#221c06"/>
        <rect x="25"  y="14" width="5"  height="74" fill="#221c06"/>
        <rect x="170" y="8"  width="22" height="92" fill="#1a1404"/>
        <rect x="166" y="4"  width="30" height="10" fill="#2a2008"/>
        <rect x="166" y="88" width="30" height="10" fill="#2a2008"/>
        <rect x="169" y="14" width="5"  height="74" fill="#221c06"/>
        <rect x="188" y="14" width="5"  height="74" fill="#221c06"/>
        <circle cx="100" cy="90" r="50" fill="none" stroke="#a07010" strokeWidth="2"   opacity={0.7}/>
        <circle cx="100" cy="90" r="40" fill="none" stroke="#c09020" strokeWidth="1.5" opacity={0.5}/>
        <circle cx="100" cy="90" r="30" fill="none" stroke="#e0b030" strokeWidth="1"   opacity={0.4}/>
        <ellipse cx="100" cy="112" rx="55" ry="6" fill="#2a2008" opacity={0.35}/>
        <rect x="0" y="112" width="200" height="8" fill="#0c0a02"/>
      </>);
    default:
      return null;
  }
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function EvolutionCard({ stage, index }: { stage: EvolutionStage; index: number }) {
  const rarity = rarityFor(stage.lv);
  const isHolo = stage.lv >= 6;

  return (
    <Reveal delay={index * 55}>
      <div
        className="relative overflow-hidden group cursor-default"
        style={{
          border: `2px solid ${rarity.border}`,
          boxShadow: `3px 3px 0 #000, 0 0 28px ${stage.color}14`,
          background: "#050505",
        }}
      >
        {/* Holographic sweep on hover (RARE+) */}
        {isHolo && (
          <div
            className="absolute inset-0 z-30 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background: "linear-gradient(105deg,transparent 20%,rgba(255,255,255,0.06) 50%,transparent 80%)",
              backgroundSize: "200% 100%",
              animation: "holoSweep 2.4s linear infinite",
            }}
          />
        )}

        {/* Top-left: token ID */}
        <div
          className="absolute top-2 left-2 z-20 font-pixel text-[7px] px-1.5 py-0.5"
          style={{ background: "rgba(0,0,0,0.6)", color: "#3a4a58", border: "1px solid #111" }}
        >
          #{String(stage.lv).padStart(4, "0")}
        </div>

        {/* Top-right: rarity badge */}
        <div
          className="absolute top-2 right-2 z-20 font-pixel text-[7px] px-1.5 py-0.5"
          style={{
            background: rarity.bg,
            color: rarity.color,
            border: `1px solid ${rarity.color}55`,
            letterSpacing: "0.08em",
          }}
        >
          {rarity.label}
        </div>

        {/* Scene */}
        <div className="relative overflow-hidden" style={{ height: 176, background: BG[stage.lv] }}>
          <div className="absolute inset-0 grid-bg opacity-10" />

          <svg
            viewBox="0 0 200 120"
            className="absolute inset-0 w-full h-full pixelated"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden
          >
            <SceneElements lv={stage.lv} />
          </svg>

          {/* Ambient glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
            style={{ width: 96, height: 96, background: stage.color, filter: "blur(44px)", opacity: 0.2 }}
          />

          {/* Sprite */}
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-1">
            <div style={{ filter: `drop-shadow(0 0 14px ${stage.color}cc)` }}>
              <DemonMascot skin={stage.skin} size={82} />
            </div>
          </div>
        </div>

        {/* Card footer */}
        <div
          className="px-3 py-3"
          style={{ background: "#040404", borderTop: `2px solid ${rarity.border}` }}
        >
          <div className="flex items-center justify-between mb-0.5">
            <p className="font-pixel text-[8px]" style={{ color: "#2a3540" }}>LV.{stage.lv}</p>
            <p className="font-pixel text-[7px]" style={{ color: rarity.color, opacity: 0.85 }}>
              ◈ {rarity.label}
            </p>
          </div>
          <p className="font-pixel text-[11px]" style={{ color: stage.color }}>{stage.name}</p>
          <p className="mt-1 font-pixel text-[7px]" style={{ color: "#1e2830" }}>
            SUPPLY 999 · SEASON 1
          </p>
        </div>
      </div>
    </Reveal>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

export default function AmintaEvolutionGrid() {
  return (
    <section className="relative py-20 md:py-28 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />

      <style>{`
        @keyframes holoSweep {
          0%   { background-position: -100% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      <div className="relative mx-auto max-w-7xl px-5">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="font-pixel text-[9px] text-accent uppercase tracking-[0.3em]">
            GENESIS COLLECTION · SEASON 1
          </p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Collect Every Form
          </h2>
          <p className="mt-4 text-muted">
            Feed Aminta. Earn XP. Unlock all 9 evolutions.{" "}
            <span className="text-accent">Your companion grows when you do.</span>
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {STAGES.map((stage, i) => (
            <EvolutionCard key={stage.lv} stage={stage} index={i} />
          ))}
        </div>

        <Reveal className="mt-12">
          <div
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-5"
            style={{ background: "#040404", border: "2px solid #0e1418", boxShadow: "3px 3px 0 #000" }}
          >
            <span className="font-pixel text-xs text-accent">POST: +50 XP</span>
            <span className="font-pixel text-xs" style={{ color: "#4a6070" }}>REPLY: +25 XP</span>
            <span className="font-pixel text-xs" style={{ color: "#f5d060" }}>◈ REACH LV.9 → ASCENDED</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
