/**
 * A Solid tree mounted inside riff's imperative render tree (spec 100's
 * strangler): each island is a Solid view in a box the shell lays out
 * imperatively.
 */

import { BoxRenderable, type BoxOptions, type CliRenderer } from "@opentui/core"
// `_render` is @internal upstream, but it is the only entry that mounts into an
// existing renderable rather than the renderer root; the exact version pin guards it.
import { _render, createComponent, RendererContext, type JSX } from "@opentui/solid"
import { keepAlive } from "../utils/renderables"

export interface SolidIsland {
  /** Kept alive, so `discard` of whatever holds it unmounts it rather than destroying it. */
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
