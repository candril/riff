import { createTestRenderer, type TestRenderer } from "@opentui/core/testing"
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
