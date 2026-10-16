import { test, expect, describe } from "bun:test"
import { ScrollBarRenderable } from "@opentui/core"
import { createSignal } from "solid-js"
import { mountJsx, mountRenderable } from "../testing/frame"
import "./scroll-bar"

/*
 * The bar alone on a one-column screen as tall as the viewport, read as a
 * string of its cells from the top, a space for each cell of bare track.
 */

const columnOf = (frame: string, height: number) =>
  Array.from({ length: height }, (_, y) => frame.split("\n")[y]?.[0] ?? " ").join("")

type Mounted = Awaited<ReturnType<typeof mountJsx>>

async function thumbOf(mounting: Mounted | Promise<Mounted>, height: number) {
  const mounted = await mounting
  await mounted.setup.renderOnce()
  await mounted.setup.renderOnce()
  const column = columnOf(mounted.setup.captureCharFrame(), height)
  await mounted.dispose()
  return column
}

interface Sizes {
  viewport: number
  scroll: number
  position?: number
}

// The attributes in each order, since Solid sets an intrinsic's props in the order JSX lists them.
const viewportFirst = ({ viewport, scroll, position = 0 }: Sizes) =>
  thumbOf(
    mountJsx(
      () => (
        <box width={1} height={viewport}>
          <scroll_bar width={1} viewportSize={viewport} scrollSize={scroll} scrollPosition={position} />
        </box>
      ),
      { width: 1, height: viewport }
    ),
    viewport
  )

const scrollFirst = ({ viewport, scroll, position = 0 }: Sizes) =>
  thumbOf(
    mountJsx(
      () => (
        <box width={1} height={viewport}>
          <scroll_bar width={1} scrollSize={scroll} viewportSize={viewport} scrollPosition={position} />
        </box>
      ),
      { width: 1, height: viewport }
    ),
    viewport
  )

describe("the scrollbar's thumb", () => {
  test("8 rows of a 30-row diff: a thumb two cells tall, whichever size is set first", async () => {
    expect(await viewportFirst({ viewport: 8, scroll: 30 })).toBe("██      ")
    expect(await scrollFirst({ viewport: 8, scroll: 30 })).toBe("██      ")
  })

  test("at the top it starts on the top row, at the last scroll position it ends on the bottom row", async () => {
    expect(await viewportFirst({ viewport: 8, scroll: 30, position: 0 })).toMatch(/^█/)
    expect(await viewportFirst({ viewport: 8, scroll: 30, position: 22 })).toBe("      ██")
    expect(await scrollFirst({ viewport: 8, scroll: 30, position: 22 })).toBe("      ██")
  })

  test("a resize that changes only the viewport resizes the thumb", async () => {
    const [height, setHeight] = createSignal(8)
    const mounted = await mountJsx(
      () => (
        <box width={1} height={height()}>
          <scroll_bar width={1} viewportSize={height()} scrollSize={30} scrollPosition={0} />
        </box>
      ),
      { width: 1, height: 12 }
    )
    await mounted.setup.renderOnce()
    await mounted.setup.renderOnce()
    expect(columnOf(mounted.setup.captureCharFrame(), 8)).toBe("██      ")
    setHeight(12)
    expect(await thumbOf(mounted, 12)).toBe("████▀       ")
  })

  // OpenTUI's slider caps the viewport at the scroll range, so the thumb never takes more than half the track.
  test("a window over half the diff draws a thumb of half the track", async () => {
    expect(await viewportFirst({ viewport: 8, scroll: 10 })).toBe("████    ")
    expect(await scrollFirst({ viewport: 8, scroll: 10, position: 2 })).toBe("    ████")
  })

  // The behaviour PaneScrollBar works around. Once OpenTUI sizes the thumb whatever the order, this fails, and the override can go.
  test("OpenTUI 0.6.0's own bar, its viewport set before its scroll size, draws a sliver", async () => {
    const mounted = await mountRenderable(
      (renderer) => {
        const bar = new ScrollBarRenderable(renderer, { orientation: "vertical", width: 1, height: 8 })
        bar.viewportSize = 8
        bar.scrollSize = 30
        return bar
      },
      { width: 1, height: 8 }
    )
    await mounted.setup.renderOnce()
    await mounted.setup.renderOnce()
    const column = columnOf(mounted.setup.captureCharFrame(), 8)
    await mounted.dispose()
    expect(column).toBe("▀       ")
  })
})
