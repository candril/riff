import { describe, expect, test } from "bun:test"
import { getSubmenuRows } from "./submenu"
import { createInitialState } from "../../state"
import { createActionMenuState } from "./state"
import { actionMenuModel } from "../../components/action-menu-model"

const links = [
  { label: "#1213", url: "https://github.com/o/r/pull/1213", detail: "Fix renewal (merged)" },
  { label: "galaxus.ch", url: "https://galaxus-ch-preview-pr10747.example.com" },
]

const state = createInitialState([], [], "local", "local changes")

function submenuPalette(query = "") {
  const actionMenu = createActionMenuState()
  actionMenu.showSubmenu({ kind: "links", links, action: "open", title: "Links — Description" })
  if (query) actionMenu.setQuery(query)
  return actionMenu.snapshot()
}

describe("the links submenu", () => {
  test("one row per link, with what it points at beside it", () => {
    expect(getSubmenuRows(state, submenuPalette())).toEqual([
      { id: "link:0", icon: "🔗", label: "#1213", trailing: "Fix renewal (merged)" },
      { id: "link:1", icon: "🔗", label: "galaxus.ch", trailing: undefined },
    ])
  })

  test("typing narrows on the title too — that is what the reader remembers", () => {
    expect(getSubmenuRows(state, submenuPalette("renewal")).map((row) => row.id)).toEqual(["link:0"])
  })

  test("and on the label", () => {
    expect(getSubmenuRows(state, submenuPalette("galaxus")).map((row) => row.id)).toEqual(["link:1"])
  })
})

describe("a submenu's highlighted matches (spec 007)", () => {
  const rowsFor = (query: string) => actionMenuModel({ kind: "submenu", title: "Links", rows: getSubmenuRows(state, submenuPalette(query)) }, 0, 60).rows

  test("a label match lands on the label, past the icon", () => {
    const row = rowsFor("galax")[0]
    expect(row?.kind === "submenu" && [row.labelSpans, row.trailingSpans]).toEqual([
      [
        { text: "🔗  ", matched: false },
        { text: "galax", matched: true },
        { text: "us.ch", matched: false },
      ],
      [],
    ])
  })

  test("a row ranked on its id, which is not drawn, shows the label's own match", () => {
    const actionMenu = createActionMenuState()
    actionMenu.showSubmenu({ kind: "links", links: [{ label: "Lorem ink", url: "https://x.example" }], action: "open", title: "Links" })
    actionMenu.setQuery("link")
    const [row] = actionMenuModel({ kind: "submenu", title: "Links", rows: getSubmenuRows(state, actionMenu.snapshot()) }, 0, 60).rows
    expect(row?.kind === "submenu" && [row.labelSpans, row.trailingSpans]).toEqual([
      [
        { text: "🔗  ", matched: false },
        { text: "L", matched: true },
        { text: "orem ", matched: false },
        { text: "ink", matched: true },
      ],
      [],
    ])
  })

  test("a row ranked on its id whose label does not match shows the note's own match", () => {
    const actionMenu = createActionMenuState()
    actionMenu.showSubmenu({ kind: "links", links: [{ label: "#7", url: "https://x.example", detail: "Lorem ink" }], action: "open", title: "Links" })
    actionMenu.setQuery("link")
    const [row] = actionMenuModel({ kind: "submenu", title: "Links", rows: getSubmenuRows(state, actionMenu.snapshot()) }, 0, 60).rows
    expect(row?.kind === "submenu" && [row.labelSpans, row.trailingSpans]).toEqual([
      [{ text: "🔗  #7", matched: false }],
      [
        { text: "L", matched: true },
        { text: "orem ", matched: false },
        { text: "ink", matched: true },
      ],
    ])
  })

  test("a row ranked on its id with nothing drawn that matches shows no match", () => {
    const actionMenu = createActionMenuState()
    actionMenu.showSubmenu({ kind: "links", links: [{ label: "#7", url: "https://x.example", detail: "docs" }], action: "open", title: "Links" })
    actionMenu.setQuery("link")
    const [row] = actionMenuModel({ kind: "submenu", title: "Links", rows: getSubmenuRows(state, actionMenu.snapshot()) }, 0, 60).rows
    expect(row?.kind === "submenu" && [row.labelSpans, row.trailingSpans]).toEqual([
      [{ text: "🔗  #7", matched: false }],
      [{ text: "docs", matched: false }],
    ])
  })

  test("a match on the note beside it lands on the note", () => {
    const row = rowsFor("renewal")[0]
    expect(row?.kind === "submenu" && [row.labelSpans, row.trailingSpans]).toEqual([
      [{ text: "🔗  #1213", matched: false }],
      [
        { text: "Fix ", matched: false },
        { text: "renewal", matched: true },
        { text: " (merged)", matched: false },
      ],
    ])
  })
})
