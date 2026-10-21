import type { CliRenderer, TextareaRenderable } from "@opentui/core"
import { createSignal, Show } from "solid-js"
import { ChatPane } from "../features/chat/ChatPane"
import { chatColors } from "../features/chat/markdown-style"
import type { ChatState } from "../features/chat/state"
import { mountSolid } from "./solid-island"

type View = { state: ChatState; focused: boolean }

export interface ChatColumnInput {
  state: ChatState
  width: number
  focused: boolean
}

/**
 * The chat column as a long-lived island, docked right of the thread panel.
 * The conversation lives in its ChatState, so the island is only handed
 * that and redraws from its signals; closing hides the host and keeps the
 * input, with whatever was half typed in it.
 */
export function createChatColumnIsland(renderer: CliRenderer) {
  const [view, setView] = createSignal<View | null>(null)
  let input: TextareaRenderable | null = null

  const island = mountSolid(
    renderer,
    () => (
      <Show when={view()}>
        {(current: () => View) => (
          <ChatPane
            state={current().state}
            focused={current().focused}
            onInput={(textarea) => (input = textarea)}
          />
        )}
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
        const current = view()
        if (!current || current.state !== next.state || current.focused !== next.focused) {
          setView({ state: next.state, focused: next.focused })
        }
      }
      island.host.visible = next !== null
    },
    /** Null until the first update draws the pane. */
    input: () => input,
    dispose() {
      island.dispose()
    },
  }
}

export type ChatColumnIsland = ReturnType<typeof createChatColumnIsland>
