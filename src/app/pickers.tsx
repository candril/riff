import type { CliRenderer, InputRenderable } from "@opentui/core"
import { batch, type JSX } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { PromptInput } from "../components/PromptInput"
import { FilePicker } from "../components/FilePicker"
import { CommentsPicker } from "../components/CommentsPicker"
import { MarksPicker } from "../components/MarksPicker"
import { OccurrencePicker } from "../components/OccurrencePicker"
import { CommitPicker } from "../components/CommitPicker"
import { ActionMenu } from "../components/ActionMenu"
import { filePickerModel, type FilePickerModel } from "../components/file-picker-model"
import { commentsPickerModel, type CommentsPickerModel } from "../components/comments-picker-model"
import { marksPickerModel, type MarksPickerModel } from "../components/marks-picker-model"
import { occurrencePickerModel, type OccurrencePickerModel } from "../components/occurrence-picker-model"
import { commitPickerModel, type CommitPickerModel } from "../components/commit-picker-model"
import { actionMenuModel, type ActionMenuModel } from "../components/action-menu-model"
import { findOccurrences } from "../features/occurrence-picker/filter"
import { mountSolid } from "./solid-island"

/**
 * A picker as a long-lived island. The host carries the full-screen
 * placement, since an absolute child of a static host would be placed
 * against the host rather than the screen.
 */
export function createPickerIsland<Model extends object>(
  renderer: CliRenderer,
  options: {
    id: string
    owner: string
    closed: Model
    zIndex?: number
    draw: (props: { model: Model; field: InputRenderable }) => JSX.Element
  }
) {
  const field = PromptInput(renderer, options.owner)
  const [state, setState] = createStore<{ shown: boolean; model: Model }>({ shown: false, model: options.closed })
  // Hidden rather than unmounted when the picker closes: a node Solid removes
  // is destroyed on the next tick once it has no parent, and PromptInput
  // hands out this same field every time the picker opens.
  const island = mountSolid(
    renderer,
    () => (
      <box visible={state.shown} width="100%" height="100%">
        {options.draw({
          get model() {
            return state.model
          },
          field,
        })}
      </box>
    ),
    { id: options.id, position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: options.zIndex }
  )
  return {
    host: island.host,
    update(next: Model | null) {
      batch(() => {
        setState("shown", next !== null)
        if (next) setState("model", reconcile(next))
      })
    },
    dispose: island.dispose,
  }
}

export function createFilePickerIsland(renderer: CliRenderer) {
  return createPickerIsland<FilePickerModel>(renderer, {
    id: "file-picker-overlay",
    owner: "file-picker",
    closed: filePickerModel([], 0, renderer.height),
    draw: (props) => <FilePicker model={props.model} field={props.field} />,
  })
}

export function createCommentsPickerIsland(renderer: CliRenderer) {
  return createPickerIsland<CommentsPickerModel>(renderer, {
    id: "comments-picker-overlay",
    owner: "comments-picker",
    closed: commentsPickerModel([], 0, renderer.height),
    draw: (props) => <CommentsPicker model={props.model} field={props.field} />,
  })
}

export function createMarksPickerIsland(renderer: CliRenderer) {
  return createPickerIsland<MarksPickerModel>(renderer, {
    id: "marks-picker-overlay",
    owner: "marks-picker",
    closed: marksPickerModel([], 0, false, renderer.height),
    draw: (props) => <MarksPicker model={props.model} field={props.field} />,
  })
}

export function createOccurrencePickerIsland(renderer: CliRenderer) {
  return createPickerIsland<OccurrencePickerModel>(renderer, {
    id: "occurrence-picker-overlay",
    owner: "occurrence-picker",
    closed: occurrencePickerModel("", false, findOccurrences([], ""), 0, renderer.height),
    draw: (props) => <OccurrencePicker model={props.model} field={props.field} />,
  })
}

export function createCommitPickerIsland(renderer: CliRenderer) {
  return createPickerIsland<CommitPickerModel>(renderer, {
    id: "commit-picker-overlay",
    owner: "commit-picker",
    closed: commitPickerModel(
      { commits: [], selectedIndex: 0, viewingCommit: null, marked: new Set(), filtering: false, query: "", extending: false },
      renderer.width,
      renderer.height,
      new Date()
    ),
    draw: (props) => <CommitPicker model={props.model} field={props.field} />,
  })
}

export function createActionMenuIsland(renderer: CliRenderer) {
  return createPickerIsland<ActionMenuModel>(renderer, {
    id: "action-menu-overlay",
    owner: "action-menu",
    closed: actionMenuModel({ kind: "actions", actions: [] }, 0),
    // Above the comments panel (50), so the palette is reachable while a thread is visible (spec 042).
    zIndex: 100,
    draw: (props) => <ActionMenu model={props.model} field={props.field} />,
  })
}

export type PickerIsland<Model extends object> = ReturnType<typeof createPickerIsland<Model>>
export type FilePickerIsland = ReturnType<typeof createFilePickerIsland>
export type CommentsPickerIsland = ReturnType<typeof createCommentsPickerIsland>
export type MarksPickerIsland = ReturnType<typeof createMarksPickerIsland>
export type OccurrencePickerIsland = ReturnType<typeof createOccurrencePickerIsland>
export type CommitPickerIsland = ReturnType<typeof createCommitPickerIsland>
export type ActionMenuIsland = ReturnType<typeof createActionMenuIsland>
