import { describe, expect, test } from "bun:test"
import { getSubmenuRows } from "./submenu"
import { createInitialState } from "../../state"
import { createActionMenuState } from "./state"

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
