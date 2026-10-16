import { ScrollBarRenderable, type RenderableOptions, type RenderContext } from "@opentui/core"
import { extend } from "@opentui/solid"
import { theme } from "../theme"

// Never read by the constructor: @opentui/solid types an intrinsic's JSX props from its
// constructor options, so without them JSX would refuse the props Solid sets through the setters.
interface PaneScrollBarOptions extends RenderableOptions<ScrollBarRenderable> {
  viewportSize?: number
  scrollSize?: number
  scrollPosition?: number
}

/**
 * The vertical scrollbar beside a diff, its thumb as tall against the track
 * as the window is against the diff, up to the half of the track that
 * SliderRenderable's clamp allows. Solid constructs an intrinsic with
 * `{ id }` alone, and ScrollBarRenderable reads its orientation, arrows and
 * track only there, hence a subclass that fixes them.
 *
 * In OpenTUI 0.6.0 ScrollBarRenderable hands its slider the viewport only
 * when the viewport is set, and SliderRenderable clamps that to the scroll
 * range as it stands then, down to 0.01 while the range is empty. A
 * viewport set before the scroll size thus leaves a sliver of a thumb, as
 * VimDiffView's ScrollBox shows, and Solid's order of setting props is not
 * one to build on. So every change to either size hands the slider the
 * viewport again, against the range as it now is. scroll-bar.test.tsx
 * pins this bar in both orders and OpenTUI's own bar's sliver, so an
 * upgrade that changes either fails there.
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

  override get viewportSize() {
    return super.viewportSize
  }

  override set viewportSize(value: number) {
    super.viewportSize = value
    this.reapplyViewport()
  }

  override get scrollSize() {
    return super.scrollSize
  }

  override set scrollSize(value: number) {
    super.scrollSize = value
    this.reapplyViewport()
  }

  private reapplyViewport() {
    if (this.isDestroyed || this.slider.isDestroyed) return
    this.slider.viewPortSize = Math.max(1, this.viewportSize)
  }
}

extend({ scroll_bar: PaneScrollBar })

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    scroll_bar: typeof PaneScrollBar
  }
}
