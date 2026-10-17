import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import {
  createActionMenuIsland,
  createCommentsPickerIsland,
  createCommitPickerIsland,
  createFilePickerIsland,
  createMarksPickerIsland,
  createOccurrencePickerIsland,
} from "./pickers"
import { filePickerModel, type FilteredFile } from "../components/file-picker-model"
import { commentsPickerModel } from "../components/comments-picker-model"
import { marksPickerModel } from "../components/marks-picker-model"
import { occurrencePickerModel } from "../components/occurrence-picker-model"
import { commitPickerModel, type CommitPickerInput } from "../components/commit-picker-model"
import { actionMenuModel } from "../components/action-menu-model"
import type { ResolvedAction } from "../actions"
import { findOccurrences } from "../features/occurrence-picker/filter"
import type { OccurrenceRow } from "../features/occurrence-picker/corpus"
import { PromptInput } from "../components/PromptInput"
import { findText, trimFrame } from "../testing/frame"

let setup: TestRendererSetup | null = null

afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

async function screen() {
  await setup!.renderOnce()
  await setup!.renderOnce()
  return trimFrame(setup!.captureCharFrame())
}

/** A full-screen parent, as render.ts's root box is, for the absolute host to sit in. */
async function mount<T extends { host: BoxRenderable }>(create: (renderer: TestRendererSetup["renderer"]) => T) {
  setup = await createTestRenderer({ width: 100, height: 24 })
  const island = create(setup.renderer)
  const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" })
  setup.renderer.root.add(parent)
  parent.add(island.host)
  return island
}

const files: FilteredFile[] = ["a.ts", "b.ts", "c.ts"].map((filename, index) => ({
  file: { filename, additions: 1, deletions: 0, status: "modified", content: "" },
  index,
}))

test("the file picker opens, moves its selection in place, closes and reopens on the same live field", async () => {
  const island = await mount(createFilePickerIsland)
  const field = PromptInput(setup!.renderer, "file-picker")
  expect(await screen()).toBe("")

  island.update(filePickerModel(files, 0, 24))
  expect(await screen()).toMatch(/Find Files\s+1\/3  esc/)
  const row = findText(island.host, "b.ts")
  expect(row).toBeDefined()
  expect(field.parent).not.toBeNull()

  island.update(filePickerModel(files, 1, 24))
  expect(await screen()).toMatch(/Find Files\s+2\/3  esc/)
  expect(findText(island.host, "b.ts")).toBe(row!)

  island.update(null)
  expect(await screen()).toBe("")
  // Past the tick on which Solid destroys a node it has let go of.
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(field.isDestroyed).toBe(false)
  expect(field.parent).not.toBeNull()

  island.update(filePickerModel(files, 2, 24))
  expect(await screen()).toMatch(/Find Files\s+3\/3  esc/)
  expect(PromptInput(setup!.renderer, "file-picker")).toBe(field)
  expect(field.isDestroyed).toBe(false)
  expect(field.parent).not.toBeNull()
  island.dispose()
})

test("the comments and marks pickers each keep their own field across a close", async () => {
  const comments = await mount(createCommentsPickerIsland)
  const marks = createMarksPickerIsland(setup!.renderer)
  setup!.renderer.root.getChildren()[0]!.add(marks.host)
  const commentsField = PromptInput(setup!.renderer, "comments-picker")
  const marksField = PromptInput(setup!.renderer, "marks-picker")
  expect(commentsField).not.toBe(marksField)

  comments.update(commentsPickerModel([], 0, 24))
  expect(await screen()).toContain("No comments")
  comments.update(null)
  marks.update(marksPickerModel([], 0, false, 24))
  const shown = await screen()
  expect(shown).not.toContain("Find Comments")
  expect(shown).toContain("No marks — m{letter} sets one")
  marks.update(null)
  await screen()
  await new Promise((resolve) => setTimeout(resolve, 10))
  for (const field of [commentsField, marksField]) {
    expect(field.isDestroyed).toBe(false)
    expect(field.parent).not.toBeNull()
  }
  comments.dispose()
  marks.dispose()
})

const rows: OccurrenceRow[] = [{ fileIndex: 0, filename: "a.ts", kind: "addition", lineNum: 1, side: "RIGHT", text: "const a = 1" }]

test("the occurrence picker hides on null and reopens on the same live field", async () => {
  const island = await mount(createOccurrencePickerIsland)
  const field = PromptInput(setup!.renderer, "occurrence-picker")
  island.update(occurrencePickerModel("const", false, findOccurrences(rows, "const"), 0, 24))
  expect(await screen()).toMatch(/Occurrences\s+\^g narrow  1 in 1 file  esc/)

  island.update(null)
  expect(await screen()).toBe("")
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(field.isDestroyed).toBe(false)
  expect(field.parent).not.toBeNull()

  island.update(occurrencePickerModel("const", true, findOccurrences(rows, "const"), 0, 24))
  expect(await screen()).toContain("const ›")
  expect(PromptInput(setup!.renderer, "occurrence-picker")).toBe(field)
  expect(field.parent).not.toBeNull()
  island.dispose()
})

test("the commit picker keeps its field mounted, only hidden, while not filtering and across a close", async () => {
  const island = await mount(createCommitPickerIsland)
  const field = PromptInput(setup!.renderer, "commit-picker")
  const input = (filtering: boolean): CommitPickerInput => ({
    commits: [],
    selectedIndex: 0,
    viewingCommit: null,
    marked: new Set(),
    filtering,
    query: "",
    extending: false,
  })
  island.update(commitPickerModel(input(false), 80, 24, new Date()))
  expect(await screen()).toContain("/ to filter")
  expect(field.parent).not.toBeNull()
  expect(field.parent!.visible).toBe(false)

  island.update(commitPickerModel(input(true), 80, 24, new Date()))
  expect(await screen()).not.toContain("/ to filter")
  expect(field.parent!.visible).toBe(true)

  island.update(null)
  expect(await screen()).toBe("")
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(field.isDestroyed).toBe(false)

  island.update(commitPickerModel(input(true), 80, 24, new Date()))
  expect(await screen()).toContain("Select Commit")
  expect(PromptInput(setup!.renderer, "commit-picker")).toBe(field)
  expect(field.parent).not.toBeNull()
  island.dispose()
})

const actions: ResolvedAction[] = [
  { id: "quit", label: "Quit", description: "", category: "general", shortcut: "q", available: () => true },
  { id: "react", label: "React…", description: "", category: "github", available: () => true },
]

test("the command palette swaps its list for a submenu and back on one live field, above the comments panel", async () => {
  const island = await mount(createActionMenuIsland)
  const field = PromptInput(setup!.renderer, "action-menu")
  expect(island.host.zIndex).toBe(100)

  island.update(actionMenuModel({ kind: "actions", actions }, 1, 24))
  expect(await screen()).toMatch(/Commands\s+esc/)
  const fieldBox = field.parent
  expect(fieldBox).not.toBeNull()
  const quit = findText(island.host, "Quit")
  expect(quit).toBeDefined()

  island.update(actionMenuModel({ kind: "submenu", title: "React", rows: [{ id: "react:heart", icon: "♥", label: "Heart" }] }, 0, 24))
  const submenu = await screen()
  expect(submenu).toMatch(/React\s+esc to back/)
  expect(submenu).toContain("♥  Heart")
  expect(submenu).not.toContain("Quit")
  expect(PromptInput(setup!.renderer, "action-menu")).toBe(field)
  expect(field.parent).toBe(fieldBox)

  island.update(actionMenuModel({ kind: "actions", actions }, 0, 24))
  const back = await screen()
  expect(back).toContain("Quit")
  expect(back).not.toContain("Heart")
  expect(field.parent).toBe(fieldBox)

  island.update(null)
  expect(await screen()).toBe("")
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(field.isDestroyed).toBe(false)
  expect(field.parent).toBe(fieldBox)
  island.dispose()
})
