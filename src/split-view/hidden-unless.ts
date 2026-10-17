import { Renderable } from "@opentui/core"
import { createRenderEffect, type JSX } from "solid-js"

/**
 * A held row, hidden while it is outside the window. A row drawn as one box
 * hides whole and leaves the column, so the rows in the window stack from the
 * top. Anything else would leave a held row drawn over the window, so it fails
 * loudly rather than quietly.
 */
export function hiddenUnless(row: JSX.Element, shown: () => boolean) {
  if (!(row instanceof Renderable)) throw new Error("A held row must render a single Renderable to be hidden")
  createRenderEffect(() => (row.visible = shown()))
  return row
}
