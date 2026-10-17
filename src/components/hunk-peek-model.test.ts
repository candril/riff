import { test, expect, describe } from "bun:test"
import { hunkPeekModel } from "./hunk-peek-model"

const screen = { terminalWidth: 100, terminalHeight: 30 }

describe("the hunk peek", () => {
  const base = { filename: "src/a/b.ts", line: 9, outdated: false, fromRoot: false, ...screen }

  test("colours each row by its marker and blanks an empty row to a space", () => {
    const model = hunkPeekModel({ ...base, hunk: "@@ -1 +1 @@\n ctx\n\n-old\n+new\n\n" })
    expect(model.body).toEqual({
      kind: "rows",
      rows: [
        { text: "@@ -1 +1 @@", tone: "blue" },
        { text: " ctx", tone: "text" },
        { text: " ", tone: "text" },
        { text: "-old", tone: "red" },
        { text: "+new", tone: "green" },
      ],
    })
    expect(model.header).toEqual([
      { text: "b.ts:9", tone: "primary" },
      { text: "the code this was written against", tone: "dim" },
    ])
    expect(model.width).toBe(40 + 4)
    expect(model.footer).toBe("c or Esc to close")
  })

  test("an outdated thread from the root is peach and says where the hunk came from", () => {
    const model = hunkPeekModel({ ...base, hunk: "+x", outdated: true, fromRoot: true })
    expect(model.header).toEqual([
      { text: "b.ts:9", tone: "primary" },
      { text: "as it was when this was written", tone: "peach" },
      { text: "· from the thread's first comment", tone: "dim" },
    ])
    expect(model.width).toBe("b.ts:9 as it was when this was written · from the thread's first comment".length + 4)
  })

  test("keeps the tail of a hunk taller than the room, and cuts wide rows", () => {
    const hunk = Array.from({ length: 40 }, (_, i) => `+${i}`).join("\n") + `\n+${"w".repeat(200)}`
    const model = hunkPeekModel({ ...base, hunk })
    if (model.body.kind !== "rows") throw new Error("rows expected")
    expect(model.body.rows).toHaveLength(24)
    expect(model.body.rows[0]).toEqual({ text: "…", tone: "text" })
    expect(model.body.rows[1]!.text).toBe("+18")
    expect(model.body.rows[23]!.text).toBe("+" + "w".repeat(90) + "…")
    expect(model.width).toBe(96)
  })
})
