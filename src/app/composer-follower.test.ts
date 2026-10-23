import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { createMentionsState } from "../features/mentions/state"
import { createComposerPickersState } from "../features/inline-comment-overlay/composer-pickers-state"
import { createComposerFollower } from "./composer-follower"
import type { ComposerSession } from "./composer-session"

function follow() {
  let state: AppState = createInitialState([], [], "test", "")
  state = { ...state, inlineCommentOverlay: { ...state.inlineCommentOverlay, open: true, mode: "compose" } }
  const sessions: (ComposerSession | null)[] = []
  let renders = 0
  const composerPickers = createComposerPickersState()
  const follower = createComposerFollower((session) => void sessions.push(session), {
    getState: () => state,
    render: () => renders++,
    mentions: createMentionsState(),
    composerPickers,
  })
  return { follower, sessions, state: () => state, setState: (next: AppState) => (state = next), composerPickers, renders: () => renders }
}

describe("the composer following the frame", () => {
  test("hands the textarea the frame's session, whose activity opens the emoji picker and renders", () => {
    const { follower, sessions, composerPickers, renders } = follow()
    follower.update({ key: "src/greet.ts:2:compose:", initialValue: "", mode: "compose" })

    const session = sessions.at(-1)!
    expect(session).toMatchObject({ key: "src/greet.ts:2:compose:", initialValue: "", mode: "compose" })
    session.onActivity!("hi :smil", 8)
    expect(composerPickers.emoji()?.query).toBe("smil")
    expect(renders()).toBe(1)
  })

  test("activity with the thread panel closed opens no picker", () => {
    const { follower, sessions, state, setState, composerPickers } = follow()
    follower.update({ key: "src/greet.ts:2:compose:", initialValue: "", mode: "compose" })
    setState({ ...state(), inlineCommentOverlay: { ...state().inlineCommentOverlay, open: false } })
    sessions.at(-1)!.onActivity!("ask @da :smil", 13)
    expect([composerPickers.mention(), composerPickers.emoji()]).toEqual([null, null])
  })

  test("with no composer the textarea's session is closed", () => {
    const { follower, sessions } = follow()
    follower.update(null)
    expect(sessions).toEqual([null])
  })
})
