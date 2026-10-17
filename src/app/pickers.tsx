import type { CliRenderer, InputRenderable } from "@opentui/core"
import type { JSX } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { PromptInput } from "../components/PromptInput"
import { FilePicker } from "../components/FilePicker"
import { CommentsPicker } from "../components/CommentsPicker"
import { MarksPicker } from "../components/MarksPicker"
import { filePickerModel, type FilePickerModel } from "../components/file-picker-model"
import { commentsPickerModel, type CommentsPickerModel } from "../components/comments-picker-model"
import { marksPickerModel, type MarksPickerModel } from "../components/marks-picker-model"
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
    { id: options.id, position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }
  )
  return {
    host: island.host,
    update(next: Model | null) {
      setState("shown", next !== null)
      if (next) setState("model", reconcile(next))
    },
    dispose: island.dispose,
  }
}

export function createFilePickerIsland(renderer: CliRenderer) {
  return createPickerIsland<FilePickerModel>(renderer, {
    id: "file-picker-overlay",
    owner: "file-picker",
    closed: filePickerModel([], 0),
    draw: (props) => <FilePicker model={props.model} field={props.field} />,
  })
}

export function createCommentsPickerIsland(renderer: CliRenderer) {
  return createPickerIsland<CommentsPickerModel>(renderer, {
    id: "comments-picker-overlay",
    owner: "comments-picker",
    closed: commentsPickerModel([], 0),
    draw: (props) => <CommentsPicker model={props.model} field={props.field} />,
  })
}

export function createMarksPickerIsland(renderer: CliRenderer) {
  return createPickerIsland<MarksPickerModel>(renderer, {
    id: "marks-picker-overlay",
    owner: "marks-picker",
    closed: marksPickerModel([], 0, false),
    draw: (props) => <MarksPicker model={props.model} field={props.field} />,
  })
}

export type PickerIsland<Model extends object> = ReturnType<typeof createPickerIsland<Model>>
export type FilePickerIsland = ReturnType<typeof createFilePickerIsland>
export type CommentsPickerIsland = ReturnType<typeof createCommentsPickerIsland>
export type MarksPickerIsland = ReturnType<typeof createMarksPickerIsland>
