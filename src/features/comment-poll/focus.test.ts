import { describe, expect, test } from "bun:test"
import type { AppMode } from "../../types"
import { focusHandler, reportsFocus } from "./focus"

describe("reportsFocus", () => {
  test("asks for focus events only when something acts on them", () => {
    expect(reportsFocus({ onFocus: true, interval: 300 }, "local")).toBe(true)
    expect(reportsFocus({ onFocus: true, interval: 0 }, "local")).toBe(true)
    expect(reportsFocus({ onFocus: true, interval: 300 }, "pr")).toBe(true)
    expect(reportsFocus({ onFocus: true, interval: 0 }, "pr")).toBe(false)
    expect(reportsFocus({ onFocus: false, interval: 300 }, "local")).toBe(false)
  })
})

describe("focusHandler", () => {
  function handler(startMode: AppMode) {
    let appMode = startMode
    let reloads = 0
    const pollFocus: boolean[] = []
    const onFocus = focusHandler({
      appMode: () => appMode,
      setPollFocused: (focused) => pollFocus.push(focused),
      reloadLocal: () => {
        reloads++
      },
    })
    return {
      onFocus,
      pollFocus,
      reloads: () => reloads,
      setAppMode: (next: AppMode) => {
        appMode = next
      },
    }
  }

  test("a local review reloads once when the terminal comes back", () => {
    const h = handler("local")
    h.onFocus(false)
    h.onFocus(true)
    expect(h.reloads()).toBe(1)
  })

  test("a focus without a blur before it is no regain", () => {
    const h = handler("local")
    h.onFocus(true)
    expect(h.reloads()).toBe(0)
    h.onFocus(false)
    h.onFocus(true)
    h.onFocus(true)
    expect(h.reloads()).toBe(1)
  })

  test("a local review that opened its branch's pull request leaves the regain to the poll", () => {
    const h = handler("local")
    h.onFocus(false)
    h.setAppMode("pr")
    h.onFocus(true)
    expect(h.reloads()).toBe(0)
    expect(h.pollFocus).toEqual([false, true])
  })

  test("a PR review never reloads locally and hands the poll every event", () => {
    const h = handler("pr")
    h.onFocus(false)
    h.onFocus(true)
    h.onFocus(false)
    expect(h.reloads()).toBe(0)
    expect(h.pollFocus).toEqual([false, true, false])
  })

  test("a local review still hands the poll every event, so its gate holds once the review is a PR", () => {
    const h = handler("local")
    h.onFocus(true)
    h.onFocus(false)
    h.onFocus(true)
    expect(h.pollFocus).toEqual([true, false, true])
  })
})
