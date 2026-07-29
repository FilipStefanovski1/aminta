import { LoginForm } from "@/components/auth/LoginForm"
import { AUTH_PROVIDERS } from "@/lib/authProviders"

// X-first launch: only "Continue with X" is shown here. Google and
// email/password stay fully implemented in LoginForm — see
// lib/authProviders.ts to re-enable either, and /login/legacy for the
// always-on fallback existing accounts can already use.
export default function LoginPage() {
  return <LoginForm providers={AUTH_PROVIDERS} />
}
