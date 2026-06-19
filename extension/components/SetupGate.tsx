import type { ReactNode } from "react"

import OnboardingWizard from "~components/OnboardingWizard"
import type { AmintaStore } from "~lib/storage"

interface Props {
  store: AmintaStore
  onSave: (patch: Partial<AmintaStore>) => Promise<void> | void
  children: ReactNode
}

export default function SetupGate({ store, onSave, children }: Props) {
  if (!store.onboardingDone) {
    return (
      <OnboardingWizard
        store={store}
        onDone={(patch) => onSave(patch) as Promise<void>}
      />
    )
  }
  return <>{children}</>
}
