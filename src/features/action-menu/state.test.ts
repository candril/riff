import { describe, expect, test } from "bun:test"
import type { ActionSubmenu } from "../../actions/types"
import { createActionMenuState } from "./state"

const links: ActionSubmenu = { kind: "links", links: [], action: "open", title: "Open link" }

function opened() {
  const actionMenu = createActionMenuState()
  actionMenu.show()
  return actionMenu
}

describe("the command palette's state", () => {
  test("starts closed, with an empty field on the action list", () => {
    const actionMenu = createActionMenuState()
    expect(actionMenu.open()).toBe(false)
    expect(actionMenu.snapshot()).toEqual({ query: "", selectedIndex: 0, submenu: null })
  })

  test("opens with an empty field on the first row of the action list", () => {
    const actionMenu = opened()
    actionMenu.setQuery("diff")
    actionMenu.move(2, 5)
    actionMenu.showSubmenu(links)
    actionMenu.show()
    expect(actionMenu.open()).toBe(true)
    expect(actionMenu.snapshot()).toEqual({ query: "", selectedIndex: 0, submenu: null })
  })

  test("the selection wraps at both ends", () => {
    const actionMenu = opened()
    actionMenu.move(-1, 4)
    expect(actionMenu.selectedIndex()).toBe(4)
    actionMenu.move(1, 4)
    expect(actionMenu.selectedIndex()).toBe(0)
    actionMenu.move(3, 4)
    expect(actionMenu.selectedIndex()).toBe(3)
  })

  test("a new query puts the selection back on the first row", () => {
    const actionMenu = opened()
    actionMenu.move(2, 4)
    actionMenu.setQuery("tog")
    expect(actionMenu.snapshot()).toEqual({ query: "tog", selectedIndex: 0, submenu: null })
  })

  test("a submenu starts fresh, with an empty field on its first row", () => {
    const actionMenu = opened()
    actionMenu.setQuery("rea")
    actionMenu.move(1, 4)
    actionMenu.showSubmenu(links)
    expect(actionMenu.open()).toBe(true)
    expect(actionMenu.snapshot()).toEqual({ query: "", selectedIndex: 0, submenu: links })
  })

  test("a submenu on a closed palette opens it", () => {
    const actionMenu = createActionMenuState()
    actionMenu.showSubmenu(links)
    expect(actionMenu.open()).toBe(true)
    expect(actionMenu.submenu()).toBe(links)
  })

  test("leaving a submenu goes back to the action list with an empty field", () => {
    const actionMenu = opened()
    actionMenu.showSubmenu(links)
    actionMenu.setQuery("x")
    actionMenu.move(1, 2)
    actionMenu.closeSubmenu()
    expect(actionMenu.open()).toBe(true)
    expect(actionMenu.snapshot()).toEqual({ query: "", selectedIndex: 0, submenu: null })
  })

  test("leaving a submenu with none open changes nothing", () => {
    const actionMenu = opened()
    actionMenu.setQuery("tog")
    actionMenu.move(2, 4)
    actionMenu.closeSubmenu()
    expect(actionMenu.open()).toBe(true)
    expect(actionMenu.snapshot()).toEqual({ query: "tog", selectedIndex: 2, submenu: null })
  })

  test("closing resets the field, the selection and the submenu", () => {
    const actionMenu = opened()
    actionMenu.showSubmenu(links)
    actionMenu.setQuery("x")
    actionMenu.move(1, 2)
    actionMenu.close()
    expect(actionMenu.open()).toBe(false)
    expect(actionMenu.snapshot()).toEqual({ query: "", selectedIndex: 0, submenu: null })
  })
})
