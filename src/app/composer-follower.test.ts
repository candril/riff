import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { createMentionsState } from "../features/mentions/state"
import { createComposerFollower } from "./composer-follower"
import type { ComposerSession } from "./composer-session"

function follow() {
  let state: AppState = createInitialState([], [], "test", "")
  state = { ...state, inlineCommentOverlay: { ...state.inlineCommentOverlay, open: true, mode: "compose" } }
  const sessions: (ComposerSession | null)[] = []
  let renders = 0
  const follower = createComposerFollower((session) => void sessions.push(session), {
    getState: () => state,
    setState: (updater) => (state = updater(state)),
    render: () => renders++,
    mentions: createMentionsState(),
  })
  return { follower, sessions, state: () => state, renders: () => renders }
}

describe("the composer following the frame", () => {
  test("hands the textarea the frame's session, whose activity opens the emoji picker and renders", () => {
    const { follower, sessions, state, renders } = follow()
    follower.update({ key: "src/greet.ts:2:compose:", initialValue: "", mode: "compose" })

    const session = sessions.at(-1)!
    expect(session).toMatchObject({ key: "src/greet.ts:2:compose:", initialValue: "", mode: "compose" })
    session.onActivity!("hi :smil", 8)
    expect(state().inlineCommentOverlay.emojiPicker?.query).toBe("smil")
    expect(renders()).toBe(1)
  })

  test("with no composer the textarea's session is closed", () => {
    const { follower, sessions } = follow()
    follower.update(null)
    expect(sessions).toEqual([null])
  })
})
