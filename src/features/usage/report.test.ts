import { expect, test } from "bun:test"
import type { Action } from "../../actions/types"
import { actions } from "../../actions/registry"
import { formatUsageReport, KEY_ATTRIBUTION, usageReport } from "./report"

const action = (id: string, more: Partial<Action> = {}): Action => ({
  id,
  label: id.toUpperCase(),
  description: "",
  available: () => true,
  ...more,
})

const ACTIONS = [
  action("next-file", { command: "bracket.nextFile" }),
  action("search", { command: "diff.key", shortcut: "/" }),
  action("open-browser", { shortcut: "go" }),
  action("quit", { command: "global.quit" }),
  action("clear", {}),
]

const COUNTS = {
  since: "2026-11-01T00:00:00.000Z",
  keys: { "bracket.nextFile": 9, "diff.key /": 2, "diff.key j": 400 },
  palette: { quit: 1, "open-browser": 3 },
}

test("each action reads its key count off its command, or off its key for the diff's", () => {
  const report = usageReport(COUNTS, ACTIONS)

  expect(report.actions).toEqual([
    { id: "clear", label: "CLEAR", countedAs: null, shared: false, byKey: 0, byPalette: 0 },
    { id: "quit", label: "QUIT", countedAs: "global.quit", shared: false, byKey: 0, byPalette: 1 },
    { id: "search", label: "SEARCH", countedAs: "diff.key /", shared: false, byKey: 2, byPalette: 0 },
    { id: "open-browser", label: "OPEN-BROWSER", countedAs: null, shared: false, byKey: null, byPalette: 3 },
    { id: "next-file", label: "NEXT-FILE", countedAs: "bracket.nextFile", shared: false, byKey: 9, byPalette: 0 },
  ])
  expect(report.otherCommands).toEqual([{ name: "diff.key j", count: 400 }])
})

test("an action whose key runs a command it does not name is counted off that command and key", () => {
  const report = usageReport(
    { since: "x", keys: { "diff.key y": 4, "gchord.openLink": 2 }, palette: {} },
    [action("yank", { shortcut: "y" }), action("open-in-browser", { shortcut: "go" })],
  )

  expect(report.actions).toEqual([
    { id: "open-in-browser", label: "OPEN-IN-BROWSER", countedAs: "gchord.openLink", shared: true, byKey: 2, byPalette: 0 },
    { id: "yank", label: "YANK", countedAs: "diff.key y", shared: false, byKey: 4, byPalette: 0 },
  ])
})

test("every action in the registry has its key counted, or none to count", () => {
  const unseen = usageReport(null, actions).actions.filter((row) => row.byKey === null).map((row) => row.id)

  expect(unseen).toEqual([])
  expect(Object.keys(KEY_ATTRIBUTION).filter((id) => !actions.some((candidate) => candidate.id === id))).toEqual([])
})

test("the text report counts the actions nobody used, and says when nothing is recorded", () => {
  const text = formatUsageReport(usageReport({ ...COUNTS, palette: {} }, ACTIONS))

  expect(text).toContain("2 of 5 actions never used; 1 more never picked from the palette, their key not seen.")
  expect(text).toContain("(key not seen)")
  expect(text).toContain("(palette only)")
  expect(formatUsageReport(usageReport(null, ACTIONS))).toStartWith("No usage recorded yet.")
})
