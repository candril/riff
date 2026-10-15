/**
 * A Solid tree mounted inside riff's imperative render tree (spec 100's
 * strangler): one view at a time moves to Solid while render.ts keeps
 * rebuilding everything around it.
 */

import { BoxRenderable, type BoxOptions, type CliRenderer } from "@opentui/core"
// `_render` is @internal upstream, but it is the only entry that mounts into an
// existing renderable rather than the renderer root; the exact version pin guards it.
import { _render, createComponent, RendererContext, type JSX } from "@opentui/solid"
import { keepAlive } from "../utils/renderables"

export interface SolidIsland {
  /** Kept alive, so render.ts's `discard` unmounts it and the next pass re-adds it. */
  host: BoxRenderable
  dispose(): void
}

export function mountSolid(
  renderer: CliRenderer,
  code: () => JSX.Element,
  layout: BoxOptions = { width: "100%" }
): SolidIsland {
  const host = keepAlive(new BoxRenderable(renderer, layout))
  // The provider is what lets components inside the island call useRenderer().
  const disposeSolid = _render(
    () =>
      createComponent(RendererContext.Provider, {
        get value() {
          return renderer
        },
        get children() {
          return code()
        },
      }),
    host
  )
  return {
    host,
    dispose() {
      disposeSolid()
      host.destroyRecursively()
    },
  }
}
