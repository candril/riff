import { afterEach, expect, mock, test } from "bun:test"
import { filterEmoji } from "../utils/emoji"
import { composing } from "../testing/composer-keys"

let dispose: (() => Promise<void>) | null = null
afterEach(async () => {
  mock.restore()
  await dispose?.()
  dispose = null
})

/**
 * The picker floats above the composer. On a panel with no threads the
 * composer must still sit at the panel's foot, or the picker climbs over
 * the header; on a short panel the list must give up rows rather than the
 * selection, which is what Tab inserts.
 */
const cases = [
  { height: 24, typed: "hi :smil", title: ":emoji", first: `:${filterEmoji("smil")[0]!.name}:` },
  { height: 14, typed: ":s", title: ":emoji", first: `:${filterEmoji("s")[0]!.name}:` },
  { height: 24, typed: "ask @da", title: "@mention", first: "dana" },
  { height: 14, typed: "ask @da", title: "@mention", first: "dana" },
] as const

for (const { height, typed, title, first } of cases) {
  test(`at 120x${height}, typing ${typed} on an empty panel opens the picker inside it, the selection in view`, async () => {
    const opened = await composing({}, { width: 120, height })
    opened.app.mentions.merge(["dana", "dave"])
    dispose = opened.app.dispose
    await opened.app.setup.mockInput.typeText(typed)
    const rows = (await opened.app.frame()).split("\n")
    const at = (text: string) => rows.findIndex((row) => row.includes(text))

    const header = at("Composing")
    const pickerTitle = rows.findIndex((row) => row.trimEnd().endsWith(title))
    const selected = rows.findIndex((row) => row.includes(first) && row.includes("▸ "))
    const label = at("New comment @ greet.ts")
    expect(header).toBeGreaterThan(-1)
    expect(rows[header]).toContain("all files")
    expect(pickerTitle).toBeGreaterThan(header)
    expect(selected).toBeGreaterThan(pickerTitle)
    expect(label).toBeGreaterThan(selected)
  })
}
