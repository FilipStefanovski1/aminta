import Reveal from "./Reveal";
import DemonMascot from "./DemonMascot";
import type { DemonSkin } from "./demon-data";

interface EvolutionStage {
  lv: number;
  name: string;
  color: string;
  skin?: DemonSkin;
  locked: boolean;
}

const STAGES: EvolutionStage[] = [
  {
    lv: 1,
    name: "Dormant Aminta",
    color: "#6dbfa0",
    skin: { body: "#2d3a48", horn: "#1a2230", eye: "#6dbfa0" },
    locked: false,
  },
  {
    lv: 2,
    name: "Curious Aminta",
    color: "#74f7b5",
    skin: { body: "#1a5e48", horn: "#0f3d30", eye: "#74f7b5" },
    locked: false,
  },
  {
    lv: 3,
    name: "Happy Aminta",
    color: "#40e898",
    skin: { body: "#169962", horn: "#0d6642", eye: "#9dffd0" },
    locked: false,
  },
  {
    lv: 4,
    name: "Excited Aminta",
    color: "#00c8a8",
    skin: { body: "#0cb889", horn: "#087d5e", eye: "#c8fff0" },
    locked: false,
  },
  {
    lv: 5,
    name: "Mischievous Aminta",
    color: "#00e0c0",
    skin: { body: "#06d0a8", horn: "#04906e", eye: "#ffffff" },
    locked: false,
  },
  {
    lv: 6,
    name: "Confident Aminta",
    color: "#00dcc0",
    skin: { body: "#00dcc0", horn: "#009e88", eye: "#ffffff" },
    locked: false,
  },
  { lv: 7, name: "???", color: "#74f7b5", locked: true },
  { lv: 8, name: "???", color: "#a0ffd6", locked: true },
  { lv: 9, name: "???", color: "#f5d060", locked: true },
];

// SVG scene decorations — all in grayscale, rendered inside an <svg> parent
function sceneElements(lv: number) {
  switch (lv) {
    case 1: // Dormant — night / moon
      return (
        <>
          {/* crescent moon */}
          <circle cx="168" cy="22" r="13" fill="#2a2a2a" />
          <circle cx="174" cy="16" r="11" fill="#0d0d0d" />
          {/* stars */}
          <rect x="22" y="10" width="2" height="2" fill="#3a3a3a" />
          <rect x="65" y="6" width="2" height="2" fill="#333" />
          <rect x="102" y="16" width="2" height="2" fill="#3a3a3a" />
          <rect x="135" y="9" width="2" height="2" fill="#2a2a2a" />
          <rect x="48" y="28" width="2" height="2" fill="#2a2a2a" />
          <rect x="90" y="32" width="2" height="2" fill="#333" />
          {/* ground */}
          <rect x="0" y="100" width="200" height="20" fill="#161616" />
          <rect x="0" y="98" width="200" height="2" fill="#252525" />
          {/* rocks */}
          <rect x="18" y="93" width="10" height="5" fill="#1e1e1e" />
          <rect x="22" y="91" width="6" height="2" fill="#1e1e1e" />
          <rect x="155" y="92" width="14" height="6" fill="#1e1e1e" />
          <rect x="159" y="90" width="8" height="2" fill="#1e1e1e" />
        </>
      );
    case 2: // Hungry — outdoor / sun
      return (
        <>
          {/* sun */}
          <circle cx="168" cy="20" r="9" fill="#2a2a2a" />
          <rect x="165" y="4" width="3" height="8" fill="#222" />
          <rect x="165" y="28" width="3" height="8" fill="#222" />
          <rect x="152" y="17" width="8" height="3" fill="#222" />
          <rect x="180" y="17" width="8" height="3" fill="#222" />
          <rect x="156" y="8" width="3" height="3" fill="#222" />
          <rect x="180" y="8" width="3" height="3" fill="#222" />
          <rect x="156" y="28" width="3" height="3" fill="#222" />
          <rect x="180" y="28" width="3" height="3" fill="#222" />
          {/* tree — left */}
          <rect x="28" y="68" width="8" height="32" fill="#1e1e1e" />
          <rect x="16" y="46" width="32" height="26" fill="#222" />
          <rect x="12" y="56" width="40" height="16" fill="#1e1e1e" />
          {/* small tree — far left */}
          <rect x="148" y="78" width="6" height="22" fill="#1e1e1e" />
          <rect x="140" y="60" width="22" height="20" fill="#222" />
          {/* ground */}
          <rect x="0" y="100" width="200" height="20" fill="#161616" />
          <rect x="0" y="98" width="200" height="2" fill="#252525" />
          {/* grass tufts */}
          <rect x="60" y="96" width="2" height="4" fill="#1e1e1e" />
          <rect x="64" y="95" width="2" height="5" fill="#1e1e1e" />
          <rect x="120" y="96" width="2" height="4" fill="#1e1e1e" />
          <rect x="124" y="95" width="2" height="5" fill="#1e1e1e" />
        </>
      );
    case 3: // Restless — speed / energy
      return (
        <>
          {/* speed lines left */}
          <rect x="0" y="38" width="55" height="3" fill="#2a2a2a" />
          <rect x="0" y="48" width="38" height="2" fill="#222" />
          <rect x="0" y="57" width="48" height="3" fill="#2a2a2a" />
          <rect x="0" y="66" width="30" height="2" fill="#222" />
          {/* speed lines right */}
          <rect x="150" y="42" width="50" height="3" fill="#222" />
          <rect x="165" y="54" width="35" height="2" fill="#1e1e1e" />
          {/* lightning bolt center */}
          <polygon points="108,8 96,48 112,44 100,82" fill="#2a2a2a" />
          {/* ground with cracks */}
          <rect x="0" y="100" width="200" height="20" fill="#161616" />
          <rect x="0" y="98" width="200" height="2" fill="#252525" />
          <polygon points="40,100 48,114 44,100" fill="#111" />
          <polygon points="130,100 138,112 134,100" fill="#111" />
          <polygon points="75,100 80,110 77,100" fill="#111" />
        </>
      );
    case 4: // Awakened — mystical / crystals
      return (
        <>
          {/* crystals floating */}
          <rect x="22" y="28" width="14" height="14" fill="#222" transform="rotate(45 29 35)" />
          <rect x="163" y="36" width="12" height="12" fill="#1e1e1e" transform="rotate(45 169 42)" />
          <rect x="138" y="16" width="9" height="9" fill="#222" transform="rotate(45 142 20)" />
          {/* star crosses */}
          <rect x="72" y="12" width="2" height="10" fill="#333" />
          <rect x="68" y="16" width="10" height="2" fill="#333" />
          <rect x="152" y="58" width="2" height="10" fill="#2a2a2a" />
          <rect x="148" y="62" width="10" height="2" fill="#2a2a2a" />
          <rect x="42" y="55" width="2" height="8" fill="#222" />
          <rect x="39" y="58" width="8" height="2" fill="#222" />
          {/* mystic circle on ground */}
          <circle cx="100" cy="96" r="28" fill="none" stroke="#222" strokeWidth="2" />
          <circle cx="100" cy="96" r="20" fill="none" stroke="#1a1a1a" strokeWidth="1" />
          {/* ground */}
          <rect x="0" y="100" width="200" height="20" fill="#161616" />
        </>
      );
    case 5: // Infernal — mountains / embers
      return (
        <>
          {/* mountains */}
          <polygon points="0,120 42,52 84,120" fill="#191919" />
          <polygon points="42,120 96,34 150,120" fill="#141414" />
          <polygon points="116,120 166,48 200,120" fill="#191919" />
          {/* mountain highlights */}
          <polygon points="84,120 96,34 108,120" fill="#1e1e1e" />
          {/* ember sparks */}
          <rect x="52" y="22" width="3" height="3" fill="#2a2a2a" />
          <rect x="82" y="14" width="3" height="3" fill="#333" />
          <rect x="118" y="26" width="3" height="3" fill="#2a2a2a" />
          <rect x="148" y="18" width="2" height="2" fill="#333" />
          <rect x="30" y="44" width="2" height="2" fill="#2a2a2a" />
          <rect x="168" y="32" width="2" height="2" fill="#2a2a2a" />
          <rect x="64" y="8" width="2" height="2" fill="#222" />
          <rect x="136" y="10" width="2" height="2" fill="#222" />
        </>
      );
    case 6: // Aura — radiant rings
      return (
        <>
          {/* concentric rings */}
          <circle cx="100" cy="72" r="18" fill="none" stroke="#2a2a2a" strokeWidth="2" />
          <circle cx="100" cy="72" r="32" fill="none" stroke="#1e1e1e" strokeWidth="2" />
          <circle cx="100" cy="72" r="48" fill="none" stroke="#181818" strokeWidth="2" />
          <circle cx="100" cy="72" r="62" fill="none" stroke="#141414" strokeWidth="2" />
          {/* starburst top-right */}
          <rect x="163" y="10" width="2" height="14" fill="#2a2a2a" />
          <rect x="156" y="16" width="16" height="2" fill="#2a2a2a" />
          <rect x="159" y="12" width="2" height="2" fill="#333" />
          <rect x="173" y="12" width="2" height="2" fill="#333" />
          <rect x="159" y="24" width="2" height="2" fill="#333" />
          <rect x="173" y="24" width="2" height="2" fill="#333" />
          {/* sparkle dots */}
          <rect x="28" y="18" width="2" height="2" fill="#333" />
          <rect x="22" y="44" width="2" height="2" fill="#2a2a2a" />
          <rect x="178" y="50" width="2" height="2" fill="#2a2a2a" />
          <rect x="80" y="8" width="2" height="2" fill="#333" />
          {/* ground */}
          <rect x="0" y="100" width="200" height="20" fill="#161616" />
          <rect x="0" y="98" width="200" height="2" fill="#1e1e1e" />
        </>
      );
    case 7: // Locked — city skyline
      return (
        <>
          {/* skyline buildings */}
          <rect x="0" y="72" width="16" height="48" fill="#161616" />
          <rect x="20" y="52" width="22" height="68" fill="#121212" />
          <rect x="26" y="48" width="10" height="6" fill="#161616" />
          <rect x="46" y="64" width="14" height="56" fill="#161616" />
          <rect x="63" y="40" width="26" height="80" fill="#121212" />
          <rect x="70" y="34" width="12" height="8" fill="#161616" />
          <rect x="92" y="68" width="20" height="52" fill="#161616" />
          <rect x="116" y="46" width="24" height="74" fill="#121212" />
          <rect x="121" y="40" width="14" height="8" fill="#161616" />
          <rect x="144" y="66" width="16" height="54" fill="#161616" />
          <rect x="163" y="36" width="22" height="84" fill="#121212" />
          <rect x="168" y="30" width="12" height="8" fill="#161616" />
          <rect x="188" y="58" width="12" height="62" fill="#161616" />
          {/* windows (lit) */}
          <rect x="23" y="56" width="4" height="4" fill="#1e1e1e" />
          <rect x="30" y="56" width="4" height="4" fill="#1e1e1e" />
          <rect x="66" y="44" width="5" height="5" fill="#1e1e1e" />
          <rect x="74" y="44" width="5" height="5" fill="#1e1e1e" />
          <rect x="119" y="50" width="5" height="5" fill="#1e1e1e" />
          <rect x="128" y="50" width="5" height="5" fill="#1e1e1e" />
          {/* moon */}
          <circle cx="48" cy="22" r="10" fill="#222" />
          <circle cx="54" cy="17" r="8" fill="#0d0d0d" />
          {/* stars */}
          <rect x="100" y="12" width="2" height="2" fill="#2a2a2a" />
          <rect x="140" y="8" width="2" height="2" fill="#222" />
          <rect x="10" y="20" width="2" height="2" fill="#2a2a2a" />
        </>
      );
    case 8: // Locked — dungeon / throne room
      return (
        <>
          {/* stone floor */}
          <rect x="0" y="100" width="200" height="20" fill="#131313" />
          <rect x="0" y="98" width="200" height="2" fill="#1e1e1e" />
          <rect x="0" y="100" width="200" height="1" fill="#1e1e1e" />
          {/* floor tiles */}
          {[0, 40, 80, 120, 160].map((x) => (
            <rect key={x} x={x} y="100" width="1" height="20" fill="#1a1a1a" />
          ))}
          {/* pillars */}
          <rect x="14" y="10" width="18" height="90" fill="#161616" />
          <rect x="10" y="6" width="26" height="8" fill="#1e1e1e" />
          <rect x="10" y="88" width="26" height="8" fill="#1e1e1e" />
          <rect x="168" y="10" width="18" height="90" fill="#161616" />
          <rect x="164" y="6" width="26" height="8" fill="#1e1e1e" />
          <rect x="164" y="88" width="26" height="8" fill="#1e1e1e" />
          {/* hanging banners */}
          <rect x="42" y="0" width="22" height="38" fill="#161616" />
          <polygon points="42,38 53,50 64,38" fill="#161616" />
          <rect x="136" y="0" width="22" height="38" fill="#161616" />
          <polygon points="136,38 147,50 158,38" fill="#161616" />
          {/* crown center top */}
          <rect x="82" y="4" width="36" height="16" fill="#141414" />
          <rect x="78" y="0" width="8" height="10" fill="#141414" />
          <rect x="96" y="0" width="8" height="12" fill="#141414" />
          <rect x="114" y="0" width="8" height="10" fill="#141414" />
          {/* torch flames */}
          <rect x="38" y="50" width="4" height="12" fill="#1a1a1a" />
          <polygon points="38,50 40,40 42,50" fill="#222" />
          <rect x="158" y="50" width="4" height="12" fill="#1a1a1a" />
          <polygon points="158,50 160,40 162,50" fill="#222" />
        </>
      );
    case 9: // Locked — cosmic / celestial
      return (
        <>
          {/* large planet left */}
          <circle cx="38" cy="34" r="22" fill="#161616" stroke="#1e1e1e" strokeWidth="2" />
          <ellipse cx="38" cy="34" rx="34" ry="9" fill="none" stroke="#1e1e1e" strokeWidth="2" />
          {/* small planet right */}
          <circle cx="172" cy="22" r="12" fill="#141414" stroke="#1a1a1a" strokeWidth="2" />
          {/* comet */}
          <circle cx="74" cy="16" r="4" fill="#222" />
          <polygon points="78,16 78,14 136,48 136,50" fill="#1a1a1a" />
          {/* stars scattered */}
          <rect x="96" y="8" width="2" height="2" fill="#2a2a2a" />
          <rect x="148" y="14" width="2" height="2" fill="#333" />
          <rect x="120" y="30" width="2" height="2" fill="#2a2a2a" />
          <rect x="160" y="44" width="2" height="2" fill="#2a2a2a" />
          <rect x="60" y="38" width="2" height="2" fill="#222" />
          <rect x="180" y="58" width="2" height="2" fill="#222" />
          {/* staircase bottom center */}
          <rect x="62" y="108" width="76" height="12" fill="#161616" />
          <rect x="72" y="97" width="56" height="11" fill="#141414" />
          <rect x="82" y="88" width="36" height="9" fill="#161616" />
          <rect x="90" y="80" width="20" height="8" fill="#141414" />
          <rect x="96" y="73" width="8" height="7" fill="#161616" />
          {/* clouds/mist */}
          <rect x="0" y="106" width="200" height="14" fill="#0d0d0d" />
          <rect x="0" y="100" width="50" height="8" fill="#111" />
          <rect x="150" y="100" width="50" height="8" fill="#111" />
        </>
      );
    default:
      return null;
  }
}

function EvolutionCard({ stage, index }: { stage: EvolutionStage; index: number }) {
  return (
    <Reveal delay={index * 55}>
      <div
        className="relative overflow-hidden"
        style={{
          background: "#0d0d0d",
          border: "3px solid #000",
          boxShadow: stage.locked
            ? "3px 3px 0 #000"
            : `3px 3px 0 #000, 0 0 28px ${stage.color}1a`,
        }}
      >
        {/* Scene area */}
        <div className="relative overflow-hidden" style={{ height: 176, background: "#0d0d0d" }}>
          {/* pixel grid overlay */}
          <div className="absolute inset-0 grid-bg opacity-25" />

          {/* scene SVG */}
          <svg
            viewBox="0 0 200 120"
            className="absolute inset-0 w-full h-full pixelated"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden
          >
            {sceneElements(stage.lv)}
          </svg>

          {/* ambient glow behind sprite */}
          {!stage.locked && (
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
              style={{
                width: 96,
                height: 96,
                background: stage.color,
                filter: "blur(44px)",
                opacity: 0.22,
              }}
            />
          )}

          {/* demon sprite or question mark */}
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-1">
            {stage.locked ? (
              <span
                className="font-pixel select-none"
                style={{
                  fontSize: 62,
                  lineHeight: 1,
                  color: stage.color,
                  filter: `drop-shadow(0 0 10px ${stage.color}55)`,
                  opacity: 0.7,
                }}
              >
                ?
              </span>
            ) : (
              stage.skin && (
                <div
                  style={{
                    filter: `drop-shadow(0 0 14px ${stage.color}bb)`,
                  }}
                >
                  <DemonMascot skin={stage.skin} size={82} />
                </div>
              )
            )}
          </div>
        </div>

        {/* Card label */}
        <div
          className="px-4 py-3"
          style={{ background: "#080808", borderTop: "3px solid #000" }}
        >
          <p className="font-pixel text-[10px] text-muted">LV.{stage.lv}</p>
          <p
            className="mt-0.5 font-pixel text-sm"
            style={{ color: stage.locked ? "#2e2e2e" : stage.color }}
          >
            {stage.name}
          </p>
          {stage.locked && (
            <p className="font-pixel text-[9px] mt-0.5" style={{ color: "#1e1e1e" }}>
              LOCKED
            </p>
          )}
        </div>
      </div>
    </Reveal>
  );
}

export default function AmintaEvolutionGrid() {
  return (
    <section className="relative py-20 md:py-28 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />

      <div className="relative mx-auto max-w-7xl px-5">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">Evolution</p>
          <h2 className="mt-4 font-pixel text-2xl sm:text-3xl text-white leading-snug">
            Meet Aminta
          </h2>
          <p className="mt-4 text-muted">
            Every post feeds Aminta. Every reply gives XP. Level up your sidekick as you grow on X.
          </p>
        </Reveal>

        {/* 3×3 evolution grid */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {STAGES.map((stage, i) => (
            <EvolutionCard key={stage.lv} stage={stage} index={i} />
          ))}
        </div>

        {/* XP panel */}
        <Reveal className="mt-12">
          <div
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-5"
            style={{
              background: "#080808",
              border: "3px solid #111",
              boxShadow: "3px 3px 0 #000",
            }}
          >
            <span className="font-pixel text-xs text-accent">POST: +50XP</span>
            <span className="font-pixel text-xs" style={{ color: "#8aa0b4" }}>
              REPLY: +25XP
            </span>
            <span
              className="font-pixel text-xs"
              style={{ color: "#f5d060" }}
            >
              REACH LV.9: ASCENDED
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
