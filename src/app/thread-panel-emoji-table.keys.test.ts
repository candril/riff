import { afterEach, expect, mock, test } from "bun:test"
import { filterEmoji } from "../utils/emoji"
import { composing } from "../testing/composer-keys"

let dispose: (() => Promise<void>) | null = null
afterEach(async () => {
  mock.restore()
  await dispose?.()
  dispose = null
})

const shortcodes = (query: string) => filterEmoji(query).map((emoji) => `${emoji.name} ${emoji.char}`)

/**
 * The picker's rows come from the one emoji table every composer shares.
 * A picker that restyles its rows by writing into them would turn the
 * table's entries into whatever the last query showed at that position,
 * and a later `:s` would find, draw and insert the wrong emoji.
 */
const cases = [
  { height: 24, typed: "m", downs: 0 },
  { height: 14, typed: "", downs: 6 },
] as const

for (const { height, typed, downs } of cases) {
  test(`at 120x${height}, changing the :s picker leaves the emoji table as it was`, async () => {
    const before = shortcodes("s")
    const opened = await composing({}, { width: 120, height })
    dispose = opened.app.dispose
    const input = opened.app.setup.mockInput

    await input.typeText(":s")
    const firstRows = pickerRows(await opened.app.frame())
    if (typed) await input.typeText(typed)
    for (let i = 0; i < downs; i++) {
      input.pressArrow("down")
      await opened.app.frame()
    }
    await opened.app.frame()
    expect(shortcodes("s")).toEqual(before)

    for (let i = 0; i < 2 + typed.length; i++) input.pressBackspace()
    await opened.app.frame()
    await input.typeText(":s")
    expect(pickerRows(await opened.app.frame())).toEqual(firstRows)
    expect(firstRows[0]).toBe(`:${before[0]!.split(" ")[0]}:`)
  })
}

function pickerRows(frame: string): string[] {
  const rows = frame.split("\n")
  const title = rows.findIndex((row) => row.trimEnd().endsWith(":emoji"))
  const label = rows.findIndex((row) => row.includes("New comment @ greet.ts"))
  return rows.slice(title + 1, label).filter((row) => /:[\w+-]+:/.test(row)).map((row) => row.match(/:[\w+-]+:/)![0])
}
