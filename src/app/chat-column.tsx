import type { CliRenderer, TextareaRenderable } from "@opentui/core"
import { createSignal, Show } from "solid-js"
import { ChatPane } from "../features/chat/ChatPane"
import { chatColors } from "../features/chat/markdown-style"
import type { ChatState } from "../features/chat/state"
import type { AtCandidate } from "../features/chat/at-candidates"
import { createChatAtPicker } from "../features/chat/at-picker"
import { mountSolid } from "./solid-island"

export interface ChatColumnInput {
  width: number
  focused: boolean
}

/**
 * The chat column as a long-lived island, docked right of the thread panel.
 * The conversation lives in `chat`, which outlives the column, so the island
 * is handed it once and redraws from its signals; closing hides the host and
 * keeps the input, with whatever was half typed in it.
 */
export function createChatColumnIsland(
  renderer: CliRenderer,
  chat: ChatState,
  atCandidates: () => readonly AtCandidate[] = () => [],
) {
  const [focused, setFocused] = createSignal<boolean | null>(null)
  let input: TextareaRenderable | null = null
  const atPicker = createChatAtPicker(atCandidates, () => input)

  // The pane mounts after the update that first opens it has returned, as an
  // update runs inside the frame's effects, so the input takes the focus it
  // was handed once it exists.
  let wantsFocus = false
  const settleFocus = () => {
    if (wantsFocus) input?.focus()
    else if (input?.focused) input.blur()
  }

  const island = mountSolid(
    renderer,
    () => (
      <Show when={focused() !== null}>
        <ChatPane
          state={chat}
          atPicker={atPicker}
          focused={focused() === true}
          onInput={(textarea) => {
            input = textarea
            settleFocus()
          }}
        />
      </Show>
    ),
    {
      id: "chat-column",
      flexShrink: 1,
      height: "100%",
      flexDirection: "column",
      // Mantle against the diff's base is what sets the column apart.
      backgroundColor: chatColors.background,
      paddingX: 1,
      overflow: "hidden",
      visible: false,
    }
  )

  return {
    host: island.host,
    update(next: ChatColumnInput | null) {
      if (next) {
        island.host.width = next.width
        // OpenTUI turns shrinking off on any box handed a fixed width after it is built.
        island.host.flexShrink = 1
        setFocused(next.focused)
      }
      island.host.visible = next !== null
      // The picker closes with the composer it belongs to, as the comment
      // composer's does; one left floating would take no keys.
      if (!next?.focused) atPicker.close()
      wantsFocus = next?.focused === true
      settleFocus()
    },
    /** Null until the first update draws the pane. */
    input: () => input,
    atPicker,
    dispose() {
      island.dispose()
    },
  }
}

export type ChatColumnIsland = ReturnType<typeof createChatColumnIsland>
