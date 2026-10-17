import { test, expect, afterEach } from "bun:test"
import { bgAt, fgAt, ints, mountJsx } from "../testing/frame"
import { theme } from "../theme"
import { Toast } from "./Toast"
import { toastModel, type ToastType } from "./notification-model"

/*
 * A toast alone on a 30-column screen: two cells of padding, the icon at
 * column 2 and the message from column 4.
 */

let mounted: Awaited<ReturnType<typeof mountJsx>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const cases: [ToastType, string, string][] = [
  ["success", "✓", theme.green],
  ["error", "✗", theme.red],
  ["info", "i", theme.blue],
]

for (const [type, icon, tone] of cases) {
  test(`a ${type} toast tints only its icon, on mantle`, async () => {
    mounted = await mountJsx(() => <Toast model={toastModel("Mark a set", type)} />, { width: 30, height: 1 })
    expect(await mounted.frame()).toBe(`  ${icon} Mark a set`)

    const spans = mounted.setup.captureSpans()
    for (let x = 0; x < 16; x++) expect(bgAt(spans, x, 0)).toEqual(ints(theme.mantle))
    expect(fgAt(spans, 2, 0)).toEqual(ints(tone))
    expect(fgAt(spans, 4, 0)).toEqual(ints(theme.text))
  })
}
