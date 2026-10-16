import { ScrollBarRenderable, type RenderableOptions, type RenderContext } from "@opentui/core"
import { extend } from "@opentui/solid"
import { theme } from "../theme"

// Typed only so JSX takes them: Solid sets each through its setter once the bar is built.
interface PaneScrollBarOptions extends RenderableOptions<ScrollBarRenderable> {
  viewportSize?: number
  scrollSize?: number
  scrollPosition?: number
}

/**
 * The vertical scrollbar VimDiffView's ScrollBox draws, configured as
 * VimDiffView configures it, so the thumb's size and place come from the
 * same renderable. Solid constructs an intrinsic with `{ id }` alone, and
 * ScrollBarRenderable reads its orientation, arrows and track only there,
 * hence a subclass that fixes them.
 *
 * Set the viewport before the scroll size, in JSX too. The slider clamps
 * its thumb to the scroll range as it stands when the viewport is set, and
 * VimDiffView's ScrollBox first lays out its viewport while its content is
 * still empty, so its thumb starts as a half-cell sliver; this order
 * starts this one the same way.
 */
export class PaneScrollBar extends ScrollBarRenderable {
  constructor(ctx: RenderContext, options: PaneScrollBarOptions) {
    super(ctx, {
      ...options,
      orientation: "vertical",
      showArrows: false,
      trackOptions: { backgroundColor: theme.surface0, foregroundColor: theme.surface2 },
    })
  }
}

extend({ scroll_bar: PaneScrollBar })

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    scroll_bar: typeof PaneScrollBar
  }
}
