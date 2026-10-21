import type { Renderable, TextareaRenderable } from "@opentui/core"

/** The comment composer's textarea as mounted under `host`, for tests about focus and the node itself. */
export function composerTextareaIn(host: Renderable): TextareaRenderable {
  const found = host.findDescendantById("inline-comment-composer")
  if (!found) throw new Error("no comment composer is mounted under this host")
  return found as TextareaRenderable
}
