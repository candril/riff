/**
 * The thread panel composer's keys, and those of the mention and emoji
 * pickers it opens (spec 039, 082). While the composer is open every key
 * stops here, so nothing typed into the comment reaches the panel or the
 * diff behind it.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers } from "../../app/key-variants"
import { composerOpen } from "../../app/diff-focus"
import type { ComposerHandle } from "../../app/island-composer"
import { registerAtPickerLayer, type InputPicker } from "../../app/at-picker-keys"
import type { Comment } from "../../types"
import type { InlineComposerHandlersContext } from "./handlers"
import type { MentionsState } from "../mentions/state"
import {
  cancelComposer,
  editDraftInEditor,
  emojiPicker,
  insertSuggestion,
  mentionPicker,
  saveDraft,
} from "./composer-actions"

/** How the composer closed: the reviewer's own keys, which a proposal of the agent's is told about. */
export type ComposerOutcome = "saved" | "published" | "dropped"

export interface ComposerKeyDeps extends InlineComposerHandlersContext {
  /** The composer's textarea, whose live text is the source of truth over `ov.input`. */
  composer: ComposerHandle
  /** Called once state holds the outcome: a saved comment is in `state.comments`, a dropped draft remembered. */
  composerSettled?: (outcome: ComposerOutcome) => void
  handleSubmit: (comment: Comment) => void
  /** The lines the comment being written replaces, as they read now, or null when riff cannot find them (spec 076). */
  getCommentedLines: () => string[] | null
  /** Hands the draft to $EDITOR, resolving with the edited text, or null if the editor errored. */
  openDraftInEditor: (current: string) => Promise<string | null>
  /** The @mention pool the mention picker offers behind the PR's participants. */
  mentions: Pick<MentionsState, "pool">
}

type Command = { name: string; title: string; category: string; palette: false; enabled?: () => boolean; run: (ctx: { event: KeyEvent }) => void }

export function registerComposerKeys(riffKeymap: RiffKeymap, deps: ComposerKeyDeps): () => void {
  // No preventDefault in the rest: the focused textarea types every key the
  // composer does not bind, and runs only after riff's key handler leaves it.
  const captured = riffKeymap.capture(() => composerOpen(deps.getState()))
  const command = (name: string, title: string, run: (event: KeyEvent) => void): Command => ({
    name: `composer.${name}`,
    title,
    category: "Comments",
    palette: false,
    run: ({ event }) => run(event),
  })
  const prMode = () => deps.getState().appMode === "pr"

  // Enter can afford to be the save key because saving is local; publishing
  // is the deliberate chord. Ctrl-Enter publishes only where the terminal
  // sends the kitty `CSI 13;5u` form: tmux drops the modifier unless
  // `extended-keys on`, and it then saves only. Ctrl-p is a plain control
  // byte that survives every terminal and multiplexer, so it is the one the
  // help overlay names, and it does not collide with the palette, which the
  // capture keeps out of reach. Publishing needs a PR on the other end: in
  // local mode Ctrl-Enter saves and Ctrl-p is left to the textarea.
  const unregisterComposer = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds(),
    commands: [
      command("editor", "Edit the draft in $EDITOR", () => editDraftInEditor(deps)),
      command("suggest", "Insert a suggestion block", () => insertSuggestion(deps)),
      command("cancel", "Keep the draft and close the composer", () => cancelComposer(deps)),
      command("save", "Save the comment", () => saveDraft(deps, false)),
      command("saveOrPublish", "Save the comment, or post it with Ctrl", (event) =>
        saveDraft(deps, event.ctrl && prMode()),
      ),
      { ...command("publish", "Save the comment and post it", () => saveDraft(deps, true)), enabled: prMode },
    ],
    bindings: [
      ...anyModifiers("ctrl+g", "composer.editor"),
      ...anyModifiers("ctrl+y", "composer.suggest"),
      ...anyModifiers("escape", "composer.cancel"),
      ...anyModifiers("ctrl+s", "composer.save"),
      // "return" alone: a key named "enter" is not a save key, and the
      // textarea gets it.
      ...anyModifiers("return", "composer.saveOrPublish"),
      ...anyModifiers("ctrl+p", "composer.publish"),
    ],
  })
  // Registered after the composer, the emoji picker last: it was asked
  // before the mention picker, so with both up it takes the keys.
  const pickerLayer = (name: string, picker: InputPicker) =>
    registerAtPickerLayer(riffKeymap, { prefix: `composer.${name}`, category: "Comments", holds: captured.holds, picker })
  const unregisterMention = pickerLayer("mention", mentionPicker(deps))
  const unregisterEmoji = pickerLayer("emoji", emojiPicker(deps))

  return () => {
    captured()
    unregisterComposer()
    unregisterMention()
    unregisterEmoji()
  }
}
