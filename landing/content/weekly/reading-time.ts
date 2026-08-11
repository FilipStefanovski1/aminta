// Derives reading time directly from an edition's actual rendered content
// tree instead of a manually-set number, so it can never drift out of sync
// with the real word count as articles are edited.
import { isValidElement, type ReactNode } from "react"

const WORDS_PER_MINUTE = 200

function collectText(node: ReactNode, out: string[], depth: number): void {
  if (depth > 30) return // safety net against any accidental cycle
  if (node === null || node === undefined || typeof node === "boolean") return
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node))
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out, depth)
    return
  }
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode } | null
    if (props && "children" in props) {
      // Covers DOM elements and every content primitive used *with*
      // children (P, H2, Link, etc.) — reading the children prop directly
      // is always correct here and never requires invoking the component,
      // so framework components like next/link's Link (which may use
      // hooks internally) are never called outside of a real render.
      collectText(props.children, out, depth + 1)
      return
    }
    // A component with no children prop at all — e.g. an edition's
    // <Content/>, whose real text only exists once it's invoked. Only our
    // own hook-free, zero-prop content wrapper components take this path.
    if (typeof node.type === "function") {
      const rendered = (node.type as (props: unknown) => ReactNode)(node.props)
      collectText(rendered, out, depth + 1)
    }
  }
}

/** Renders `element` to plain text (recursively, via its children props) and estimates reading time in whole minutes, minimum 1. */
export function estimateReadingTimeMinutes(element: ReactNode): number {
  const parts: string[] = []
  collectText(element, parts, 0)
  const wordCount = parts.join(" ").trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE))
}
