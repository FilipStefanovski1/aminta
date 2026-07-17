"use client";

import { useEffect, useRef } from "react";

// ─── Two-layer footer artwork.
//
// A high-resolution BASE canvas draws the sharp, mint-tinted source artwork
// once (on load/resize) and is never touched again — no per-frame
// getImageData/putImageData at DPR resolution.
//
// A separate, deliberately low-resolution FX canvas (stretched to the same
// CSS rect, imageSmoothingEnabled = false) carries the Heka-style pointer
// corruption effect. Every ~55ms it clears to fully transparent and redraws
// only the pixels currently reacting to the pointer: an opaque near-black
// block at the source position (hides that section of the base artwork) and
// one displaced mint block nearby. No persistent particle state — each
// frame is rebuilt from the low-res source sample.
//
// TEMP: swap SRC to the final Aminta asset when it's ready — nothing else in
// this file needs to change.
const SRC = "/assets/footer/footer-spark-pixel.png";
const FRAME_MS = 55;
const FRAME_MS_MOBILE = 90;
const BRIGHT_THRESHOLD = 140;

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(v, 16) || 0x74f7b5;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// nearest-neighbor cover-scale sample of a native-resolution source buffer
// into a target width/height grayscale (luminance-only) buffer.
function sampleToGrayscale(
  targetW: number,
  targetH: number,
  native: HTMLCanvasElement,
  nativeData: Uint8ClampedArray,
  sw: number,
  sh: number
): ImageData {
  const scale = Math.max(targetW / sw, targetH / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const offX = (targetW - dw) / 2;
  const offY = (targetH - dh) / 2;

  const out = new ImageData(targetW, targetH);
  const outData = out.data;
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const o = (y * targetW + x) * 4;
      const srcXf = (x - offX) / scale;
      const srcYf = (y - offY) / scale;
      if (srcXf < 0 || srcXf >= sw || srcYf < 0 || srcYf >= sh) {
        outData[o] = 0;
        outData[o + 1] = 0;
        outData[o + 2] = 0;
        outData[o + 3] = 255;
        continue;
      }
      const nx = Math.min(native.width - 1, srcXf | 0);
      const ny = Math.min(native.height - 1, srcYf | 0);
      const no = (ny * native.width + nx) * 4;
      const a = nativeData[no + 3] / 255;
      const lum = (0.299 * nativeData[no] + 0.587 * nativeData[no + 1] + 0.114 * nativeData[no + 2]) * a;
      outData[o] = lum;
      outData[o + 1] = lum;
      outData[o + 2] = lum;
      outData[o + 3] = 255;
    }
  }
  return out;
}

export default function FooterArtwork() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const baseCanvas = baseCanvasRef.current;
    const fxCanvas = fxCanvasRef.current;
    if (!wrap || !baseCanvas || !fxCanvas) return;
    const baseCtx = baseCanvas.getContext("2d");
    const fxCtx = fxCanvas.getContext("2d", { willReadFrequently: true });
    if (!baseCtx || !fxCtx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const accentHex = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#74f7b5";
    const [mintR, mintG, mintB] = parseHexColor(accentHex);

    let destroyed = false;
    let visible = false;
    let image: HTMLImageElement | null = null;

    // grayscale (R=G=B=luminance), sampled at FX (low) resolution only —
    // the base canvas is drawn once and never re-sampled per frame.
    let fxSource: ImageData | null = null;
    let darkPixels: Uint32Array = new Uint32Array(0);
    let centerX = 0;
    let centerY = 0;
    let canvasDiagonal = 1;
    let isMobileFlag = false;
    let frameCounter = 0;
    let tickTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const pointer = { x: -9999, y: -9999, active: false, strength: 0 };

    function tintToMint(data: Uint8ClampedArray) {
      for (let o = 0; o < data.length; o += 4) {
        const lum = data[o] / 255;
        data[o] = Math.round(mintR * lum);
        data[o + 1] = Math.round(mintG * lum);
        data[o + 2] = Math.round(mintB * lum);
        data[o + 3] = 255;
      }
    }

    function buildAll() {
      if (!image || destroyed) return;
      const cssW = Math.max(1, wrap!.clientWidth);
      const cssH = Math.max(1, wrap!.clientHeight);
      if (cssW < 2 || cssH < 2) return;

      const isMobile = cssW <= 900;

      let sx: number;
      let sy: number;
      let sw: number;
      let sh: number;
      if (isMobile) {
        sx = image.width * 0.265625;
        sy = image.height * 0.22;
        sw = image.width * 0.46875;
        sh = image.height * 0.56;
      } else {
        sx = 0;
        sy = 0;
        sw = image.width;
        sh = image.height;
      }

      // native-resolution offscreen crop — the only place source pixels are
      // ever read, so nothing downstream resamples/blurs the original art.
      const native = document.createElement("canvas");
      native.width = Math.max(1, Math.round(sw));
      native.height = Math.max(1, Math.round(sh));
      const nctx = native.getContext("2d", { willReadFrequently: true });
      if (!nctx) return;
      nctx.imageSmoothingEnabled = false;
      nctx.drawImage(image, sx, sy, sw, sh, 0, 0, native.width, native.height);
      const nativeData = nctx.getImageData(0, 0, native.width, native.height).data;

      // ── base canvas: HD, static, drawn once ──────────────────────────
      const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
      baseCanvas!.width = Math.round(cssW * dpr);
      baseCanvas!.height = Math.round(cssH * dpr);
      baseCanvas!.style.width = `${cssW}px`;
      baseCanvas!.style.height = `${cssH}px`;
      baseCtx!.imageSmoothingEnabled = false;

      const baseGray = sampleToGrayscale(baseCanvas!.width, baseCanvas!.height, native, nativeData, sw, sh);
      tintToMint(baseGray.data);
      baseCtx!.putImageData(baseGray, 0, 0);

      // ── fx canvas: deliberately low internal resolution, stretched to
      // the same CSS rect — this is what keeps the interaction sparse and
      // chunky instead of a dense DPR-resolution dust cloud.
      // lower internal fx resolution on mobile to cut per-frame pixel work further
      const divisor = isMobile ? 4 : 3;
      fxCanvas!.width = Math.max(1, Math.floor(cssW / divisor));
      fxCanvas!.height = Math.max(1, Math.floor(cssH / divisor));
      fxCanvas!.style.width = `${cssW}px`;
      fxCanvas!.style.height = `${cssH}px`;
      fxCtx!.imageSmoothingEnabled = false;

      fxSource = sampleToGrayscale(fxCanvas!.width, fxCanvas!.height, native, nativeData, sw, sh);

      // background (dark) pixel indices — used only for the sparse ambient
      // sparkle pass, independent of the pointer disintegration effect.
      const fxData = fxSource.data;
      const total = fxCanvas!.width * fxCanvas!.height;
      const dark: number[] = [];
      for (let idx = 0; idx < total; idx++) {
        if (fxData[idx * 4] <= BRIGHT_THRESHOLD) dark.push(idx);
      }
      darkPixels = Uint32Array.from(dark);
      centerX = fxCanvas!.width / 2;
      centerY = fxCanvas!.height / 2;
      canvasDiagonal = Math.hypot(fxCanvas!.width, fxCanvas!.height);
      isMobileFlag = isMobile;

      fxCtx!.clearRect(0, 0, fxCanvas!.width, fxCanvas!.height);
    }

    function tick() {
      if (destroyed || !fxSource || reduceMotion || !visible) return;

      const w = fxCanvas!.width;
      const h = fxCanvas!.height;
      const src = fxSource.data;

      // every frame starts fully transparent — no persistent particle state
      const frame = new ImageData(w, h);
      const data = frame.data;

      pointer.strength += ((pointer.active ? 1 : 0) - pointer.strength) * 0.25;
      if (pointer.strength > 0.01) {
        const radius = Math.max(16, w * 0.062);
        const px = pointer.x;
        const py = pointer.y;
        const minX = Math.max(0, Math.floor(px - radius));
        const maxX = Math.min(w - 1, Math.ceil(px + radius));
        const minY = Math.max(0, Math.floor(py - radius));
        const maxY = Math.min(h - 1, Math.ceil(py + radius));

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const o = (y * w + x) * 4;
            if (src[o] <= BRIGHT_THRESHOLD) continue; // only ever affects source artwork

            const dx = x - px;
            const dy = y - py;
            const dist = Math.hypot(dx, dy);
            if (dist > radius) continue;

            const force = (1 - dist / radius) * pointer.strength;
            if (Math.random() > 0.92 * force) continue;

            // opaque near-black erase block — hides this section of the HD base
            data[o] = 0;
            data[o + 1] = 0;
            data[o + 2] = 0;
            data[o + 3] = 255;

            const angle = dist > 0.001 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
            const displacement = force * radius * (0.5 + 0.9 * Math.random());
            const nx = Math.round(x + Math.cos(angle) * displacement + (Math.random() - 0.5) * 3.5);
            const ny = Math.round(y + Math.sin(angle) * displacement + (Math.random() - 0.5) * 3.5);
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

            const brightness = 170 + ((Math.random() * 86) | 0);
            const ratio = brightness / 255;
            const no = (ny * w + nx) * 4;
            data[no] = Math.round(mintR * ratio);
            data[no + 1] = Math.round(mintG * ratio);
            data[no + 2] = Math.round(mintB * ratio);
            data[no + 3] = 255;
          }
        }
      }

      // ambient background sparkle — sparse, independent of the pointer.
      // Does not increase near the cursor and never merges with the
      // disintegration cloud above.
      frameCounter++;
      const density = isMobileFlag ? 0.0006 : 0.0012;
      const sparkleCount = Math.floor(darkPixels.length * density);
      const pulse = 0.5 + 0.5 * Math.sin(frameCounter * 0.55);
      for (let n = 0; n < sparkleCount; n++) {
        const idx = darkPixels[(Math.random() * darkPixels.length) | 0];
        const sx = idx % w;
        const sy = Math.floor(idx / w);

        const distanceToCenter = Math.hypot(sx - centerX, sy - centerY) / canvasDiagonal;
        const probability = distanceToCenter < 0.3 ? 0.25 + 0.45 * pulse : 0.1;
        if (Math.random() >= probability) continue;

        const gray = 140 + ((Math.random() * 90) | 0);
        const ratio = gray / 255;
        const alpha = 0.35 + Math.random() * 0.35;
        const o = (sy * w + sx) * 4;
        data[o] = Math.round(mintR * ratio);
        data[o + 1] = Math.round(mintG * ratio);
        data[o + 2] = Math.round(mintB * ratio);
        data[o + 3] = Math.round(alpha * 255);
      }

      fxCtx!.clearRect(0, 0, w, h);
      fxCtx!.putImageData(frame, 0, 0);
    }

    function scheduleTick() {
      if (destroyed || reduceMotion) return;
      tickTimeoutId = setTimeout(() => {
        tick();
        scheduleTick();
      }, isMobileFlag ? FRAME_MS_MOBILE : FRAME_MS);
    }

    function toFxCoords(clientX: number, clientY: number) {
      const rect = fxCanvas!.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * fxCanvas!.width,
        y: ((clientY - rect.top) / rect.height) * fxCanvas!.height,
      };
    }
    function onPointerMove(e: PointerEvent | MouseEvent) {
      const { x, y } = toFxCoords(e.clientX, e.clientY);
      pointer.x = x;
      pointer.y = y;
      pointer.active = true;
    }
    function onPointerLeave() {
      pointer.active = false;
    }

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) visible = entry.isIntersecting;
    }, { threshold: 0.02 });
    io.observe(wrap);

    const ro = new ResizeObserver(() => {
      buildAll();
    });
    ro.observe(wrap);

    image = new window.Image();
    image.onload = () => {
      if (destroyed) return;
      buildAll();
      if (!reduceMotion) {
        scheduleTick();
      }
    };
    image.src = SRC;

    if (!reduceMotion) {
      fxCanvas.addEventListener("pointermove", onPointerMove, { passive: true });
      fxCanvas.addEventListener("pointerleave", onPointerLeave, { passive: true });
      fxCanvas.addEventListener("mousemove", onPointerMove, { passive: true });
      fxCanvas.addEventListener("mouseleave", onPointerLeave, { passive: true });
    }

    return () => {
      destroyed = true;
      if (tickTimeoutId) clearTimeout(tickTimeoutId);
      if (image) image.onload = null;
      io.disconnect();
      ro.disconnect();
      fxCanvas.removeEventListener("pointermove", onPointerMove);
      fxCanvas.removeEventListener("pointerleave", onPointerLeave);
      fxCanvas.removeEventListener("mousemove", onPointerMove);
      fxCanvas.removeEventListener("mouseleave", onPointerLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="footer-artwork relative w-full h-[220px] sm:h-[260px] md:h-[300px] lg:h-[360px]">
      <canvas ref={baseCanvasRef} aria-hidden className="footer-artwork-base absolute inset-0 block w-full h-full" />
      <canvas ref={fxCanvasRef} aria-hidden className="footer-artwork-fx absolute inset-0 block w-full h-full" />
      <div
        aria-hidden
        className="footer-shadow-top pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "radial-gradient(ellipse at center top, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.08) 35%, transparent 70%), " +
            "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.22) 10%, rgba(0,0,0,0.08) 22%, transparent 40%)",
        }}
      />
    </div>
  );
}
