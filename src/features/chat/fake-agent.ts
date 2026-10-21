import type { Agent, AgentEvents } from "../../providers/agent/agent"
import type { Position } from "../../providers/agent/position"
import { questionText } from "../../providers/agent/question"

// An agent the test drives by hand: it records what was asked and answers only when told.
export function fakeAgent() {
  const asked: string[] = []
  const positions: Array<Position | null> = []
  const attachments: Array<readonly string[]> = []
  // Each question as the real session hands it to the model.
  const received: string[] = []
  let events!: AgentEvents
  let starts = 0
  let interrupts = 0
  let closes = 0
  let resumedWith: string | null | undefined
  const agent: Agent = {
    model: "claude-opus-5-5",
    start(e, resumeId) {
      events = e
      starts++
      resumedWith = resumeId
      return {
        send: (q, position, attached) => {
          asked.push(q)
          positions.push(position)
          attachments.push(attached)
          received.push(questionText(q, position, attached))
        },
        interrupt: () => void interrupts++,
        close: () => void closes++,
      }
    },
  }
  return {
    agent,
    asked,
    positions,
    attachments,
    received,
    events: () => events,
    starts: () => starts,
    interrupts: () => interrupts,
    closes: () => closes,
    resumedWith: () => resumedWith,
    answer(text: string, usage = { input: 1200, output: 34 }) {
      events.text(text)
      events.answerDone({ interrupted: false, usage })
    },
  }
}
