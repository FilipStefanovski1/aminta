import Reveal from "./Reveal";
import DemonMascot from "./DemonMascot";

/* ─── shared chrome bar ─────────────────────────────────── */
function Chrome({ right }: { right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-3 h-8 border-b border-line/60 bg-panel/80 shrink-0">
      <span className="w-2 h-2 rounded-full bg-[#3a3a3a]" />
      <span className="w-2 h-2 rounded-full bg-[#3a3a3a]" />
      <span className="w-2 h-2 rounded-full bg-[#3a3a3a]" />
      <span className="ml-2 text-[9px] text-muted">x.com/home</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

function TweetRow({ short }: { short?: boolean }) {
  return (
    <div className="flex gap-2 py-2 border-b border-line/30 last:border-0">
      <div className="w-6 h-6 rounded-full bg-panel2 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1.5">
        <div className="h-1.5 w-14 rounded bg-panel2" />
        <div className="h-1.5 w-full rounded bg-panel2/60" />
        <div className={`h-1.5 rounded bg-panel2/50 ${short ? "w-2/3" : "w-4/5"}`} />
      </div>
    </div>
  );
}

/* ─── step scenes ───────────────────────────────────────── */

function SceneTimeline() {
  return (
    <div className="rounded-xl overflow-hidden border border-line/50 shadow-lg bg-ink">
      <Chrome />
      <div className="p-3 space-y-0">
        <TweetRow />
        <TweetRow short />
        <TweetRow />
      </div>
    </div>
  );
}

function ScenePanel() {
  return (
    <div className="rounded-xl overflow-hidden border border-accent/30 shadow-[0_0_28px_rgba(116,247,181,0.07)] bg-ink">
      <Chrome right={<span className="text-[9px] font-pixel text-accent">Aminta</span>} />
      <div className="grid grid-cols-[1fr_88px]">
        <div className="p-2.5 border-r border-line/40 space-y-0">
          <TweetRow />
          <TweetRow short />
        </div>
        <div className="p-2 flex flex-col gap-1.5">
          <span className="font-pixel text-[8px] text-accent">Aminta</span>
          <div className="flex gap-0.5">
            <span className="bg-accent text-black text-[7px] font-bold rounded px-1.5 py-0.5">Tweet</span>
            <span className="text-muted text-[7px] px-1 py-0.5">Reply</span>
          </div>
          <div className="rounded bg-panel2/80 border border-line/40 px-1.5 py-1.5 text-[7px] text-muted/80 leading-relaxed">
            shipping tonight...
          </div>
          <button className="rounded bg-accent text-black text-[7px] font-bold text-center py-1 w-full">
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

function ScenePublish() {
  return (
    <div className="rounded-xl overflow-hidden border border-accent/50 shadow-[0_0_36px_rgba(116,247,181,0.13)] bg-ink">
      <Chrome right={<span className="text-[9px] font-pixel text-accent">Aminta</span>} />
      <div className="grid grid-cols-[1fr_88px]">
        <div className="p-2.5 border-r border-line/40">
          <TweetRow />
          <div className="mt-1 rounded border border-accent/20 bg-panel2/30 px-2 py-2">
            <div className="h-1.5 w-full rounded bg-white/15 mb-1.5" />
            <div className="h-1.5 w-4/5 rounded bg-white/15" />
          </div>
        </div>
        <div className="p-2 flex flex-col gap-1.5">
          <span className="font-pixel text-[8px] text-accent">Aminta</span>
          <div className="rounded bg-panel2/60 border border-line/40 px-1.5 py-1.5 text-[7px] text-white/80 leading-relaxed">
            building in public hits different...
          </div>
          <button className="rounded bg-accent text-black text-[7px] font-bold text-center py-1 w-full">
            Insert into X
          </button>
          <span className="font-pixel text-[8px] text-accent text-center">+50 XP</span>
        </div>
      </div>
    </div>
  );
}

function SceneEvo() {
  return (
    <div className="rounded-xl border border-accent/20 bg-ink p-4 shadow-lg flex flex-col items-center gap-3">
      <DemonMascot
        skin={{ body: "#06d0a8", horn: "#04906e", eye: "#ffffff" }}
        size={52}
      />
      <div className="w-full space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="font-pixel text-[8px] text-accent">LV.5 MISCHIEVOUS</span>
          <span className="font-pixel text-[8px] text-white">1400 XP</span>
        </div>
        <div className="h-1.5 rounded-full bg-panel2 overflow-hidden">
          <div className="h-full rounded-full bg-accent" style={{ width: "72%" }} />
        </div>
      </div>
      <p className="text-[9px] text-muted text-center">streak active · 7 days</p>
    </div>
  );
}

/* ─── step data ─────────────────────────────────────────── */

const STEPS = [
  { num: "01", caption: "You have an idea.", Scene: SceneTimeline },
  { num: "02", caption: "Aminta helps shape it.", Scene: ScenePanel },
  { num: "03", caption: "Publish.", Scene: ScenePublish },
  { num: "04", caption: "Earn XP. Unlock evolutions.", Scene: SceneEvo },
] as const;

const XP_ITEMS = [
  { label: "Post", xp: "+50 XP" },
  { label: "Reply", xp: "+25 XP" },
  { label: "Polish", xp: "+15 XP" },
];

/* ─── main export ───────────────────────────────────────── */

export default function ThreeModes() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-20" />

      <div className="relative mx-auto max-w-7xl px-5">
        {/* heading — left-aligned, editorial */}
        <Reveal>
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">Inside X</p>
          <h2 className="mt-4 font-pixel text-3xl sm:text-4xl text-white leading-tight max-w-xl">
            Generate without leaving<br className="hidden sm:block" /> the timeline.
          </h2>
          <p className="mt-4 text-muted text-base max-w-md">
            Write, reply, and publish directly where you&apos;re already posting.
          </p>
        </Reveal>

        {/* 4-step story flow */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4">
          {STEPS.map(({ num, caption, Scene }, i) => (
            <Reveal key={num} delay={i * 90}>
              <div className="flex flex-col gap-3">
                <span className="font-pixel text-[10px] text-muted/40">{num}</span>
                <Scene />
                <p className="text-sm text-white/90 font-medium">{caption}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* XP strip */}
        <Reveal delay={280}>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {XP_ITEMS.map((item, i) => (
              <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted">
                {i > 0 && <span className="text-muted/30 hidden sm:inline">·</span>}
                <span className="font-pixel text-[10px] text-accent">{item.xp}</span>
                <span>— {item.label}</span>
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
