import { RGBA, TextRenderable, type Renderable } from "@opentui/core"
import { createTestRenderer, type TestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { testRender, type JSX } from "@opentui/solid"

/** Trailing spaces and blank rows are padding, and would make the literals unreadable. */
export function trimFrame(frame: string): string {
  return frame.split("\n").map((line) => line.trimEnd()).join("\n").replace(/\n+$/, "")
}

type Mountable = Parameters<TestRenderer["root"]["add"]>[0]

/** Whatever `build` returns, alone on a test screen of the given size. */
export async function mountRenderable(
  build: (renderer: TestRenderer) => Mountable,
  { width, height }: { width: number; height: number }
) {
  const setup = await createTestRenderer({ width, height })
  setup.renderer.root.add(build(setup.renderer))

  const frame = async () => {
    await setup.renderOnce()
    await setup.renderOnce()
    return trimFrame(setup.captureCharFrame())
  }
  const dispose = async () => {
    await setup.waitForVisualIdle().catch(() => {})
    setup.renderer.destroy()
  }
  return { frame, setup, dispose }
}

/** A Solid tree alone on a test screen of the given size. */
export async function mountJsx(code: () => JSX.Element, { width, height }: { width: number; height: number }) {
  const setup = await testRender(code, { width, height })
  const frame = async () => {
    await setup.renderOnce()
    await setup.renderOnce()
    return trimFrame(setup.captureCharFrame())
  }
  const dispose = async () => {
    await setup.waitForVisualIdle().catch(() => {})
    setup.renderer.destroy()
  }
  return { frame, setup, dispose }
}

/** The text under `root` that reads exactly `content`, to tell a kept renderable from a rebuilt one. */
export function findText(root: Renderable, content: string): TextRenderable | undefined {
  for (const child of root.getChildren()) {
    if (child instanceof TextRenderable && child.plainText === content) return child
    const found = findText(child, content)
    if (found) return found
  }
  return undefined
}

type Spans = ReturnType<TestRendererSetup["captureSpans"]>

function spanAt(spans: Spans, x: number, y: number) {
  let at = 0
  for (const span of spans.lines[y]!.spans) {
    if (x < at + span.width) return span
    at += span.width
  }
  return undefined
}

export const bgAt = (spans: Spans, x: number, y: number) => spanAt(spans, x, y)?.bg.toInts()
export const fgAt = (spans: Spans, x: number, y: number) => spanAt(spans, x, y)?.fg.toInts()
export const ints = (hex: string) => RGBA.fromHex(hex).toInts()
