// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest"

import { getActiveXIdentity } from "~lib/activeXIdentity"

afterEach(() => {
  document.body.innerHTML = ""
})

describe("getActiveXIdentity", () => {
  it("reads the handle from the left-nav profile link", () => {
    document.body.innerHTML = `<a data-testid="AppTabBar_Profile_Link" href="/filiplesterr">Profile</a>`
    expect(getActiveXIdentity()).toEqual({ username: "filiplesterr" })
  })

  it("returns null when the profile link isn't on the page", () => {
    expect(getActiveXIdentity()).toBeNull()
  })
})
