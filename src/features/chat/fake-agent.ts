import type { Agent, AgentEvents } from "../../providers/agent/agent"
import type { Position } from "../../providers/agent/position"

// An agent the test drives by hand: it records what was asked and answers only when told.
export function fakeAgent() {
  const asked: string[] = []
  const positions: Array<Position | null> = []
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
        send: (q, position) => {
          asked.push(q)
          positions.push(position)
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
