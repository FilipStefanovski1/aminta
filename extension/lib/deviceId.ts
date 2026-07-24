// Stable per-device identifier, used only for Included-AI rate-limit
// bucketing server-side (never for auth). Device-scoped, not account-scoped
// and not synced — survives sign-out/sign-in, tied to this browser install,
// exactly like apiKey/model in lib/storage.ts.
const DEVICE_ID_KEY = "amintaDeviceId"

export async function getDeviceId(): Promise<string> {
  const data = await chrome.storage.local.get(DEVICE_ID_KEY)
  if (data[DEVICE_ID_KEY]) return data[DEVICE_ID_KEY]
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: id })
  return id
}
