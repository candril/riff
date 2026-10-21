import type { CliRenderer } from "@opentui/core"

export interface LeaveSteps {
  writeVisitWatermark: () => void
  stopFocusReporting: () => void
  disposeChat: () => void
}

/** riff's teardown of everything outside the renderer, run once however riff ends. */
export function createLeave(steps: LeaveSteps): () => void {
  let left = false
  return () => {
    if (left) return
    left = true
    steps.writeVisitWatermark()
    steps.stopFocusReporting()
    steps.disposeChat()
  }
}

export function leaveOnDestroy(renderer: Pick<CliRenderer, "on">, leave: () => void): void {
  renderer.on("destroy", leave)
}
