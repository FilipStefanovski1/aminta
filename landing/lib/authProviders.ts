// Centralized visibility config for the PUBLIC-facing /login and /signup
// pages. Toggling one of these does not touch the underlying provider
// implementation (handleGoogle/handleX/email signIn/signUp all stay fully
// wired) — it only controls whether that button/form is rendered, so a
// provider can be re-enabled with a single flag flip here, no component
// rewrites required.
//
// X-first launch: only X is shown publicly. Google and email/password
// remain fully implemented and reachable by existing accounts through
// /login/legacy (not linked from any nav/UI — see that route for why).
export interface AuthProvidersConfig {
  x: boolean
  google: boolean
  email: boolean
}

export const AUTH_PROVIDERS: AuthProvidersConfig = {
  x: true,
  google: false,
  email: false,
}
