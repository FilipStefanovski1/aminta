// Fetches a remote image and returns it as a resized JPEG data URL.
// Mirrors GeneratorPanel.tsx's resizeImage() (same fetch/canvas/toDataURL
// shape) but starts from a URL instead of a local File.
//
// fetch -> blob -> object URL -> <img> -> canvas -> toDataURL. The object
// URL is always same-origin for canvas purposes, so this never taints the
// canvas even though the source (pbs.twimg.com) is cross-origin — no
// `crossOrigin` attribute juggling needed.
export async function fetchImageAsDataUrl(url: string, maxSize = 1024): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      return await new Promise<string>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
          const w = Math.round(img.width * scale)
          const h = Math.round(img.height * scale)
          const canvas = document.createElement("canvas")
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext("2d")
          if (!ctx) { reject(new Error("Canvas unavailable")); return }
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL("image/jpeg", 0.82))
        }
        img.onerror = () => reject(new Error("Image failed to load"))
        img.src = objectUrl
      })
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}
