#!/usr/bin/env node
// Validates that every Aminta evolution form shares an identical body silhouette.
// Silhouette = which pixel positions are transparent (.) vs opaque.
// Happy (Lv3, index 2) is the master template — all others must match it exactly.

const fs   = require("fs")
const path = require("path")

const src = fs.readFileSync(
  path.join(__dirname, "../lib/evolution.ts"),
  "utf8"
)

// Pull form names in declaration order
const names = [...src.matchAll(/name:\s*"([^"]+)"/g)].map(m => m[1])

// Pull every `rows: [ … ]` block and parse the quoted strings inside
const allRows = []
for (const [, block] of src.matchAll(/rows:\s*\[([\s\S]*?)\]/g)) {
  const rows = [...block.matchAll(/"([^"]+)"/g)].map(m => m[1])
  if (rows.length === 13) allRows.push(rows)
}

if (allRows.length === 0) {
  console.error("❌  No 13-row blocks found in evolution.ts")
  process.exit(1)
}

const master     = allRows[2]           // Happy = sacred master
const masterName = names[2] ?? "Happy"
let   errors     = 0

for (let fi = 0; fi < allRows.length; fi++) {
  const rows     = allRows[fi]
  const formName = names[fi] ?? `Form ${fi + 1}`

  if (rows.length !== 13) {
    console.error(`❌  ${formName}: ${rows.length} rows (expected 13)`)
    errors++
    continue
  }

  for (let r = 0; r < 13; r++) {
    const mr = master[r]
    const fr = rows[r]

    if (mr.length !== fr.length) {
      console.error(`❌  ${formName} R${r}: width ${fr.length} (master: ${mr.length})`)
      errors++
      continue
    }

    for (let x = 0; x < mr.length; x++) {
      if ((mr[x] === ".") !== (fr[x] === ".")) {
        console.error(
          `❌  ${formName} R${r} x=${x}: silhouette break ` +
          `(master="${mr[x]}" vs form="${fr[x]}")\n` +
          `    master: ${mr}\n` +
          `    form:   ${fr}`
        )
        errors++
      }
    }
  }
}

if (errors === 0) {
  console.log(
    `✅  All ${allRows.length} forms match ${masterName}'s silhouette` +
    ` (${names.join(", ")})`
  )
} else {
  console.error(`\n${errors} silhouette error(s). Fix before shipping.`)
  process.exit(1)
}
