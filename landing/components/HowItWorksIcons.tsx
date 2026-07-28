// Pixel-stroke icon set for the "How it works" section — single mint-green
// stroke, blocky/crisp corners (shape-rendering: crispEdges), no fill except
// tiny accent sparkle/pixel pixels. Kept separate from AmintaSprite.tsx, whose
// filled/shaded pixel style is a different visual register than these
// thin-line illustrations. Each icon tells a step of the user's journey
// (learning their voice → writing in it → publishing) rather than an
// abstract "input/process/output" pipeline.

import type { SVGProps } from "react";

const STROKE = 1.6;

function Sparkle({ x, y, s = 2, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <g
      className="animate-pixel-pulse"
      style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${delay}s` }}
    >
      <rect x={x - s / 2} y={y - 1.5 * s} width={s} height={s} fill="currentColor" />
      <rect x={x - 1.5 * s} y={y - s / 2} width={s} height={s} fill="currentColor" />
      <rect x={x + 0.5 * s} y={y - s / 2} width={s} height={s} fill="currentColor" />
      <rect x={x - s / 2} y={y + 0.5 * s} width={s} height={s} fill="currentColor" />
    </g>
  );
}

const shared: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 32 32",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: STROKE,
  strokeLinejoin: "miter",
  strokeLinecap: "square",
  shapeRendering: "crispEdges",
};

// Body shape shared by every Aminta pose — a small rounded-pixel companion,
// intentionally identical across icons so the character reads as the same
// "actor" moving through each step of the story.
function AmintaBody() {
  return <path d="M15,13 H21 L23,15 V21 L21,23 H15 L13,21 V15 Z" />;
}

function AmintaEyes({ x1 = 15.6, x2 = 19.6, y = 17.1 }: { x1?: number; x2?: number; y?: number }) {
  return (
    <>
      <rect x={x1} y={y} width={1.8} height={1.8} fill="currentColor" stroke="none" />
      <rect x={x2} y={y} width={1.8} height={1.8} fill="currentColor" stroke="none" />
    </>
  );
}

/** Card 1 — "Learn Your Voice": Aminta studying a stack of past posts, pulling
 *  their tone/vocabulary into itself. The dashed trail + wide focused eyes
 *  are what make it read as "watching and absorbing" rather than a static
 *  document icon. */
export function LearningIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...shared} className={className} role="img" aria-label="Aminta studying your past posts to learn your voice">
      {/* stacked past posts being studied */}
      <path d="M4,10 H12 V15 H4 Z" />
      <path d="M6,21 H14 V26 H6 Z" opacity={0.55} />
      <path d="M6.5,12.4 H10.5" strokeWidth={1.2} />
      <path d="M6.5,13.6 H9.5" strokeWidth={1.2} />
      <path d="M7.5,23 H12.5" strokeWidth={1.2} opacity={0.55} />
      <path d="M7.5,24.2 H11" strokeWidth={1.2} opacity={0.55} />

      {/* attention trail — data flowing from the posts into Aminta */}
      <g className="animate-pixel-pulse" style={{ animationDelay: "0s" }}>
        <rect x={13.5} y={13.5} width={1.4} height={1.4} fill="currentColor" stroke="none" />
      </g>
      <g className="animate-pixel-pulse" style={{ animationDelay: "0.25s" }}>
        <rect x={16.5} y={12.2} width={1.4} height={1.4} fill="currentColor" stroke="none" />
      </g>
      <g className="animate-pixel-pulse" style={{ animationDelay: "0.5s" }}>
        <rect x={19.5} y={11.2} width={1.4} height={1.4} fill="currentColor" stroke="none" />
      </g>

      {/* Aminta, attentive — wide focused eyes, watching */}
      <AmintaBody />
      <rect x={15.6} y={17.1} width={2.2} height={2.2} fill="currentColor" stroke="none" />
      <rect x={19.2} y={17.1} width={2.2} height={2.2} fill="currentColor" stroke="none" />
      <path d="M15,23 V25.5" />
      <path d="M21,23 V25.5" />

      <Sparkle x={27} y={9} s={1.6} />
      <Sparkle x={3} y={22} s={1.4} delay={0.6} />
    </svg>
  );
}

/** Card 2 — "Write Like You": Aminta mid-sentence, pencil moving fast, with
 *  motion strokes behind the tip so the pose reads as confident, active
 *  creation rather than a passive "generate" icon. */
export function WritingIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...shared} className={className} role="img" aria-label="Aminta writing a post in your voice">
      <AmintaBody />
      <AmintaEyes />
      {/* feet */}
      <path d="M15,23 V26" />
      <path d="M21,23 V26" />

      {/* pencil, mid-stroke */}
      <path d="M23,15 L29,9" />
      <path d="M27,8 L30,11" />
      <path d="M22.4,15.6 L23.6,14.4" />

      {/* confident motion lines trailing the pencil tip */}
      <path d="M20,20 H24" strokeWidth={1.2} opacity={0.6} />
      <path d="M19,22 H22.5" strokeWidth={1.2} opacity={0.4} />

      {/* the line being written, taking shape */}
      <path d="M4,24 H12" strokeWidth={1.4} />
      <path d="M4,27 H9" strokeWidth={1.4} opacity={0.55} />

      <Sparkle x={28} y={16} s={1.6} delay={0.3} />
      <Sparkle x={4} y={13} s={1.3} delay={0.9} />
    </svg>
  );
}

/** Card 3 — "Publish Faster": the drafted post launching out of the speech
 *  bubble toward X — the arrow + trail read as motion/momentum rather than a
 *  static "output" bubble, and the small × mark is a light nod to the
 *  platform without borrowing its logo. */
export function PublishIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...shared} className={className} role="img" aria-label="Publishing your post to X">
      <path d="M3,7 H17 V17 H10 L6,22 V17 H3 Z" />
      <rect x={7} y={10.6} width={1.7} height={1.7} fill="currentColor" stroke="none" />
      <rect x={10.2} y={10.6} width={1.7} height={1.7} fill="currentColor" stroke="none" />
      <rect x={13.4} y={10.6} width={1.7} height={1.7} fill="currentColor" stroke="none" />

      {/* launch trail */}
      <path d="M19,15 H23" strokeWidth={1.2} opacity={0.4} />
      <path d="M19,12 H25" strokeWidth={1.2} opacity={0.65} />

      {/* the post, launching toward X */}
      <path d="M18,9 L28,4" />
      <path d="M22,4 L28,4 L28,9" />

      {/* small "x" mark at the destination */}
      <path d="M28,17 L32,21" strokeWidth={1.4} />
      <path d="M32,17 L28,21" strokeWidth={1.4} />

      <Sparkle x={2} y={5} s={1.6} />
      <Sparkle x={30} y={11} s={1.4} delay={0.5} />
    </svg>
  );
}
