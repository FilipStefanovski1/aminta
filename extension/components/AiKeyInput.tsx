import { PROVIDERS, detectProvider } from "~lib/providers"

// The API key input + "Get a key" chip row, extracted from Settings'
// "Aminta Brain" card (sidepanel.tsx) so onboarding's API key step can reuse
// the exact same visual pattern instead of maintaining its own. Deliberately
// scoped to just this piece — Settings' Model select + Save button stay
// inline in sidepanel.tsx, since onboarding never persists a model choice
// mid-wizard (it commits everything once, at finish()).
interface Props {
  value: string
  onChange: (v: string) => void
  // Accent color for the active provider chip — avatarTint in Settings,
  // C.mint in onboarding. Each caller already computes its own tint.
  tint: string
  // Optional extra line rendered directly under the input (e.g. onboarding's
  // existing malformed-key warning). Settings doesn't pass one.
  belowInput?: React.ReactNode
  // Optional inline suffix next to the "API Key" label (Settings' "(optional)"
  // note for entitled accounts on Included AI). Onboarding doesn't pass one.
  labelSuffix?: React.ReactNode
  // Onboarding autofocuses the key input on step entry; Settings (an overlay
  // the user opens deliberately) never has, so this defaults to false.
  autoFocus?: boolean
}

export default function AiKeyInput({ value, onChange, tint, belowInput, labelSuffix, autoFocus = false }: Props) {
  const provider = detectProvider(value)

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[9px] uppercase tracking-[0.06em]" style={{ color: "#888896" }}>
          API Key {labelSuffix}
        </label>
        <span className="text-[9px]" style={{ color: "#888896" }}>
          <span style={{ color: provider.dot }}>●</span>{" "}{provider.name}
        </span>
      </div>
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        autoFocus={autoFocus}
        placeholder="gsk_…  ·  AIza…  ·  sk-or-…"
        className="input-pixel w-full rounded-lg px-3 py-2 text-[12px]"
      />

      {belowInput}

      {/* Get an API Key — Groq/OpenRouter first (short chips), Google AI
          Studio wraps to its own line. See lib/providers.ts for why the
          array's own order can't be reused directly here. */}
      <p className="text-[9px] mt-2.5" style={{ color: "#55555f" }}>Get a key:</p>
      <div className="flex items-center flex-wrap gap-1.5 mt-1">
        {(["groq", "openrouter", "google"] as const).map((id) => {
          const p = PROVIDERS.find((x) => x.id === id)!
          const active = p.id === provider.id
          return (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-pixel flex items-center gap-1 rounded-md px-1.5 py-1 text-[8px]"
              style={{
                backgroundColor: active ? tint : "#2a2a30",
                border: "2px solid #000",
                boxShadow: "2px 2px 0 #000",
                color: active ? "#000" : "#ccccd2",
              }}
            >
              {p.name}
              {p.free && (
                <span className="text-[7px]" style={{ color: active ? "#00000099" : "#8a8a92" }}>free</span>
              )}
            </a>
          )
        })}
      </div>

      <p className="text-[10px] mt-1.5 leading-none" style={{ color: "#666672" }}>
        Stored locally only.
      </p>
    </div>
  )
}
