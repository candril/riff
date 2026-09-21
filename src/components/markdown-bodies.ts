/**
 * Markdown bodies that outlive the panel rebuilt around them.
 *
 * A MarkdownRenderable holds its text back until tree-sitter has
 * highlighted it, which lands a frame or more later. Both panels tear
 * their tree down and build it again on every pass, so a body built per
 * pass vanished for a frame and came back on the next — the flicker, on
 * open and under every keystroke. In the PR panel the burst of rebuilds
 * an open sets off could also outrun the highlighter altogether and leave
 * the description blank for good.
 *
 * So the renderables live here instead, one per body, keyed by the id of
 * whatever they are the body of. `discard` unmounts them with the rest of
 * the tree, `mount` puts them back, and only text that actually changed
 * pays for a re-parse. A pass drops what it did not mount.
 */

import { MarkdownRenderable } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { keepAlive } from "../utils/renderables"

/** What the owner decides; the rest is this pool's business. */
export type MarkdownBodyStyle = Omit<
  ConstructorParameters<typeof MarkdownRenderable>[1],
  "id" | "content" | "streaming"
>

export class MarkdownBodies {
  private readonly live = new Map<string, MarkdownRenderable>()
  private readonly mounted = new Set<string>()

  constructor(private readonly renderer: CliRenderer) {}

  /** Open a build pass. Whatever it does not `mount` is dropped by `end`. */
  begin(): void {
    this.mounted.clear()
  }

  mount(id: string, content: string, style: MarkdownBodyStyle): MarkdownRenderable {
    this.mounted.add(id)
    const live = this.live.get(id)
    if (live) {
      live.content = content
      return live
    }
    const body = keepAlive(
      new MarkdownRenderable(this.renderer, {
        ...style,
        id,
        content,
        // Nothing streams here — but streaming is what makes OpenTUI lay
        // the text down from the markdown tokens up front instead of
        // waiting on the highlighter, so the first frame a body appears
        // on is the frame it reads on.
        streaming: true,
      })
    )
    this.live.set(id, body)
    return body
  }

  /** Close the pass: bodies it left out are gone from the panel. */
  end(): void {
    for (const [id, body] of this.live) {
      if (this.mounted.has(id)) continue
      this.live.delete(id)
      body.parent?.remove(body)
      body.destroyRecursively()
    }
  }

  /** The panel owning these is going away. */
  destroy(): void {
    this.mounted.clear()
    this.end()
  }
}
