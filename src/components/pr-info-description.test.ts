import { test, expect, describe } from "bun:test"
import { descriptionModel } from "./pr-info-description"
import { theme } from "../theme"

const SCREENSHOT = '<img alt="Login screen" src="https://github.com/user-attachments/assets/c0d9674a" />'
const away = { cursor: -1, active: false }

describe("descriptionModel", () => {
  test("has no body for an empty or whitespace description", () => {
    expect(descriptionModel({ body: "" }, away).body).toBeNull()
    expect(descriptionModel({ body: " \n\n  " }, away).body).toBeNull()
  })

  test("lifts the pictures out of the text and names them", () => {
    const body = `Adds it.\n\n${SCREENSHOT}\n\n![chart](https://example.com/chart.png)`
    expect(descriptionModel({ body }, away).body).toEqual({ text: "Adds it.", images: ["Login screen", "chart"] })
  })

  test("keeps the pictures of a body that was nothing else, with no text", () => {
    expect(descriptionModel({ body: SCREENSHOT }, away).body).toEqual({ text: "", images: ["Login screen"] })
  })

  test("turns the body's reactions into pills, whether or not there is a body", () => {
    const bodyReactions = [
      { content: "+1" as const, count: 3, viewerHasReacted: false },
      { content: "heart" as const, count: 0, viewerHasReacted: false },
      { content: "rocket" as const, count: 1, viewerHasReacted: true },
    ]
    expect(descriptionModel({ body: "", bodyReactions }, away).reactions).toEqual([
      { text: "👍 3", fg: theme.subtext1 },
      { text: "🚀 1", fg: theme.blue },
    ])
    expect(descriptionModel({ body: "x" }, away).reactions).toEqual([])
  })

  test("puts the cursor on a line only while the description is active and the cursor is below its header", () => {
    expect(descriptionModel({ body: "x" }, { cursor: 2, active: true }).cursorLine).toBe(2)
    expect(descriptionModel({ body: "x" }, { cursor: 0, active: true }).cursorLine).toBe(0)
    expect(descriptionModel({ body: "x" }, { cursor: -1, active: true }).cursorLine).toBeNull()
    expect(descriptionModel({ body: "x" }, { cursor: 2, active: false }).cursorLine).toBeNull()
  })
})
