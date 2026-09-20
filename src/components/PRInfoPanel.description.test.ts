import { test, expect, describe, afterAll } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { PRInfoPanelClass } from "./PRInfoPanel"
import type { PrInfo } from "../providers/github"

/**
 * A description with a markdown table in it. riff draws those itself
 * (spec 053), and the renderer it hands to `MarkdownRenderable` asks the
 * panel how wide it is — from inside the panel's own constructor.
 */
const BODY = [
  "Adds the skill.",
  "",
  "| change | asks for |",
  "| --- | --- |",
  "| add | name, official channel number, a logo file |",
  "| rename | which channel, the new name |",
  "",
  "Nothing else.",
].join("\n")

function prInfo(body: string): PrInfo {
  return {
    number: 1259,
    title: "Add the update-tv-channels skill",
    body,
    author: "someone",
    state: "open",
    headRef: "a-branch",
    baseRef: "master",
    owner: "owner",
    repo: "repo",
    url: "https://github.com/owner/repo/pull/1259",
    additions: 98,
    deletions: 0,
    changedFiles: 1,
  }
}

const { renderer } = await createTestRenderer({ width: 120, height: 40 })
const panels: PRInfoPanelClass[] = []

afterAll(() => {
  for (const panel of panels) panel.destroy?.()
})

describe("a pull request whose description holds a table", () => {
  test("opens, rather than asking a panel that does not exist yet how wide it is", () => {
    // The panel builds its sections in its constructor and assigns
    // `container` from what that returns, so the table is rendered before
    // there is a panel to measure.
    const panel = new PRInfoPanelClass(renderer, prInfo(BODY))
    panels.push(panel)
    expect(panel.getContainer()).toBeDefined()
  })

  test("a description with no table opens the same way", () => {
    const panel = new PRInfoPanelClass(renderer, prInfo("Just prose, no table."))
    panels.push(panel)
    expect(panel.getContainer()).toBeDefined()
  })

  test("an empty description opens too", () => {
    const panel = new PRInfoPanelClass(renderer, prInfo(""))
    panels.push(panel)
    expect(panel.getContainer()).toBeDefined()
  })
})
