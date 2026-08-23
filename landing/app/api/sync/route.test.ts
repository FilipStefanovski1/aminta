import { describe, expect, it } from "vitest"
import { deriveLoginXIdentity } from "./route"

describe("deriveLoginXIdentity", () => {
  it("hydrates username/displayName/avatarUrl from X login metadata", () => {
    const identity = deriveLoginXIdentity({
      app_metadata: { provider: "x" },
      identities: [{ provider: "x" }],
      user_metadata: {
        preferred_username: "filiplesterr",
        full_name: "Filip Stefanovski",
        avatar_url: "https://pbs.twimg.com/profile.jpg",
      },
    })
    expect(identity).toEqual({
      authedViaX: true,
      username: "filiplesterr",
      displayName: "Filip Stefanovski",
      avatarUrl: "https://pbs.twimg.com/profile.jpg",
    })
  })

  it("falls back to user_name and name and picture when the primary fields are absent", () => {
    const identity = deriveLoginXIdentity({
      app_metadata: { provider: "x" },
      user_metadata: {
        user_name: "filiplesterr",
        name: "Filip Stefanovski",
        picture: "https://pbs.twimg.com/profile.jpg",
      },
    })
    expect(identity).toEqual({
      authedViaX: true,
      username: "filiplesterr",
      displayName: "Filip Stefanovski",
      avatarUrl: "https://pbs.twimg.com/profile.jpg",
    })
  })

  it("detects X via the identities array when app_metadata.provider isn't set", () => {
    const identity = deriveLoginXIdentity({
      identities: [{ provider: "x" }],
      user_metadata: { preferred_username: "filiplesterr" },
    })
    expect(identity.authedViaX).toBe(true)
    expect(identity.username).toBe("filiplesterr")
  })

  it("never reports an X identity for a Google-only login, even with similar-shaped metadata", () => {
    const identity = deriveLoginXIdentity({
      app_metadata: { provider: "google" },
      identities: [{ provider: "google" }],
      user_metadata: { name: "Filip Stefanovski", avatar_url: "https://lh3.googleusercontent.com/x" },
    })
    expect(identity).toEqual({
      authedViaX: false,
      username: null,
      displayName: null,
      avatarUrl: null,
    })
  })

  it("returns nulls (not fabricated values) when X metadata is genuinely absent", () => {
    const identity = deriveLoginXIdentity({ app_metadata: { provider: "x" }, user_metadata: {} })
    expect(identity).toEqual({
      authedViaX: true,
      username: null,
      displayName: null,
      avatarUrl: null,
    })
  })
})
