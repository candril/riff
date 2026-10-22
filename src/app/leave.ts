import type { CliRenderer } from "@opentui/core"

export interface LeaveSteps {
  writeVisitWatermark: () => void
  stopFocusReporting: () => void
  disposeChat: () => void
}

/**
 * riff's teardown of everything outside the renderer, run once however riff
 * ends. A step that throws does not skip the rest: a failed watermark write
 * must not leave the terminal reporting focus or the chat running. The first
 * error is rethrown once all have run, so it still surfaces.
 */
export function createLeave(steps: LeaveSteps): () => void {
  let left = false
  return () => {
    if (left) return
    left = true
    const failures: unknown[] = []
    for (const step of [steps.writeVisitWatermark, steps.stopFocusReporting, steps.disposeChat]) {
      try {
        step()
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length > 0) throw failures[0]
  }
}

export function leaveOnDestroy(renderer: Pick<CliRenderer, "on">, leave: () => void): void {
  renderer.on("destroy", leave)
}
