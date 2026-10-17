import type { MouseEvent } from "@opentui/core"

export interface WheelSteps {
  rows(delta: number): void
  columns(delta: number): void
}

/**
 * A wheel handler that moves a diff view's window as an OpenTUI ScrollBox
 * would: a tick is a row or a column, as OpenTUI's default linear
 * acceleration counts it, and shift turns the vertical wheel sideways.
 */
export function diffWheel(steps: WheelSteps) {
  return (event: MouseEvent) => {
    const delta = Math.trunc(event.scroll?.delta ?? 0)
    if (delta === 0) return
    switch (wheelDirection(event)) {
      case "up":
        return steps.rows(-delta)
      case "down":
        return steps.rows(delta)
      case "left":
        return steps.columns(-delta)
      case "right":
        return steps.columns(delta)
    }
  }
}

function wheelDirection(event: MouseEvent) {
  const direction = event.scroll?.direction
  if (!event.modifiers.shift) return direction
  return direction === "up" ? "left" : direction === "down" ? "right" : direction === "right" ? "down" : "up"
}
