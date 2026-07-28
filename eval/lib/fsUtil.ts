import { readFileSync, writeFileSync, existsSync } from "node:fs"

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T
}

export function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8")
}

export function fileExists(path: string): boolean {
  return existsSync(path)
}

// Raw-generation filenames are derived from the (topicId, arm, index) key.
export function sanitizeFilename(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_")
}
