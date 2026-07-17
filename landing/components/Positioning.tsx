import Reveal from "./Reveal";

export default function Positioning() {
  return (
    <section className="py-14 md:py-20 border-y border-line/40">
      <div className="mx-auto max-w-2xl px-5 text-center">
        <Reveal>
          <p className="font-pixel text-xs text-accent uppercase tracking-widest">Why Aminta</p>
          <p className="mt-5 text-xl sm:text-2xl text-white leading-snug">
            Not another scheduler. Not another generic AI writer.
          </p>
          <p className="mt-3 text-base sm:text-lg text-muted">
            Aminta lives inside X, learns how you write, and evolves the more you post.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
