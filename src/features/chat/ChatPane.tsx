import type { TextareaRenderable } from "@opentui/core"
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { AtPickerView } from "../../components/AtPickerView"
import type { AtPicker } from "../../components/at-picker"
import type { ChatAtPicker } from "./at-picker"
import { EntryView } from "./EntryView"
import { chatColors } from "./markdown-style"
import type { ChatState } from "./state"
import { statusLineText } from "./status-line"

export const CHAT_HINT =
  "Ask about this review. Enter sends, Ctrl-j breaks the line, Esc stops an answer, Ctrl-n twice starts over."
const PLACEHOLDER = "Ask about this review"

// The input starts one line high and grows with what is typed, up to six lines, then scrolls.
export const MAX_INPUT_LINES = 6
export const linesIn = (text: string) => Math.min(MAX_INPUT_LINES, Math.max(1, text.split("\n").length))

const TICK_MS = 1000

/** The seconds on the status line move only while an answer runs, so an idle chat sets no timer. */
function useNow(running: () => boolean) {
  const [now, setNow] = createSignal(Date.now())
  createEffect(() => {
    if (!running()) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    onCleanup(() => clearInterval(timer))
  })
  return now
}

export function ChatPane(props: {
  state: ChatState
  atPicker: ChatAtPicker
  // Shade, not a frame, says the chat has the keys.
  focused: boolean
  onInput: (input: TextareaRenderable) => void
}) {
  let input!: TextareaRenderable
  const [inputHeight, setInputHeight] = createSignal(1)
  const now = useNow(() => props.state.status() === "answering")
  const status = () => statusLineText(props.state.activity(), props.state.clearPrompt(), now())
  const shade = () => (props.focused ? chatColors.inputFocused : chatColors.inputIdle)
  const followAt = () => props.atPicker.follow(input.plainText, input.cursorOffset)

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* flexBasis 0: a scrollbox otherwise claims its content's height and pushes the input off the column. */}
      <scrollbox
        flexGrow={1}
        flexBasis={0}
        stickyScroll
        stickyStart="bottom"
        // Answers come in from the bottom, next to the input.
        contentOptions={{ minHeight: "100%", justifyContent: "flex-end" }}
        verticalScrollbarOptions={{ visible: false }}
      >
        <Show when={props.state.entries.length === 0}>
          <text fg={chatColors.dim}>{CHAT_HINT}</text>
        </Show>
        <For each={props.state.entries}>
          {(entry) => <EntryView entry={entry} paused={props.state.paused()} />}
        </For>
      </scrollbox>
      <text height={1} marginTop={1} fg={chatColors.dim} wrapMode="none">
        {status()}
      </text>
      <box
        backgroundColor={shade()}
        paddingX={1}
        paddingY={1}
      >
        {/* Floats above the input, as the comment composer's picker does, rather than pushing it down the column. */}
        <Show when={props.atPicker.view()}>
          {(picker: () => AtPicker) => (
            <box position="absolute" bottom="100%" left={1} right={1} zIndex={60}>
              <AtPickerView picker={picker()} />
            </box>
          )}
        </Show>
        <textarea
          ref={(r: TextareaRenderable) => {
            input = r
            props.onInput(r)
          }}
          id="chat-input"
          height={inputHeight()}
          onContentChange={() => {
            setInputHeight(linesIn(input.plainText))
            followAt()
          }}
          onCursorChange={followAt}
          placeholder={PLACEHOLDER}
          backgroundColor={shade()}
          focusedBackgroundColor={shade()}
          textColor={chatColors.text}
          focusedTextColor={chatColors.text}
          placeholderColor={props.focused ? chatColors.placeholder : chatColors.dim}
          cursorColor={chatColors.question}
          wrapMode="word"
        />
      </box>
    </box>
  )
}
