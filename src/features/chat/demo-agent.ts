import type { Agent } from "../../providers/agent/agent"

export const DEMO_REPLY = "The demo runs without Claude: in a real review this column answers from riff's agent."

const CHUNK_MS = 40

/**
 * The agent `--demo` runs on. The demo promises no network and no
 * subscription, so it never spawns `claude`; it streams one fixed reply,
 * word by word, the way a real answer arrives.
 */
export function demoAgent(reply = DEMO_REPLY, chunkMs = CHUNK_MS): Agent {
  return {
    model: "demo",
    start(events) {
      let timer: ReturnType<typeof setTimeout> | null = null
      const stop = () => {
        if (timer) clearTimeout(timer)
        timer = null
      }
      return {
        send() {
          const words = reply.split(/(?<= )/)
          const next = (i: number) => {
            if (i === words.length) {
              timer = null
              events.answerDone({ interrupted: false })
              return
            }
            events.text(words[i]!)
            timer = setTimeout(() => next(i + 1), chunkMs)
          }
          timer = setTimeout(() => next(0), chunkMs)
        },
        interrupt() {
          if (!timer) return
          stop()
          events.answerDone({ interrupted: true })
        },
        close: stop,
      }
    },
  }
}
