import { batch, createSignal } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { Agent, AgentSession, Usage } from "../../providers/agent/agent"
import type { Position } from "../../providers/agent/position"
import { describeFailure, type Entry } from "./entries"

export type { Entry } from "./entries"

export interface Activity {
  phase: "thinking" | "answering"
  startedAt: number
  waiting: number
}

export type AgentStatus = "idle" | "answering" | "failed"

export type ChatState = ReturnType<typeof createChatState>

export const NEW_CONVERSATION_PROMPT = "Press Ctrl-n again to start a new conversation"

/**
 * One conversation with riff's agent. The session opens on the first
 * question, not before: opening the chat costs nothing until something is
 * asked. `position` is read once per question, when it is sent.
 */
export function createChatState(agent: Agent, position: () => Position | null = () => null) {
  const [entries, setEntries] = createStore<Entry[]>([])
  const [status, setStatus] = createSignal<AgentStatus>("idle")
  // After a failure the queue holds still until the reviewer asks again.
  const [paused, setPaused] = createSignal(false)
  const [usage, setUsage] = createSignal<Usage | null>(null)
  const [answerStartedAt, setAnswerStartedAt] = createSignal(0)
  const [clearPrompt, setClearPrompt] = createSignal<string | null>(null)
  let session: AgentSession | null = null

  const push = (entry: Entry) => setEntries(entries.length, entry)
  const streamingAnswer = () => {
    const i = entries.findLastIndex((e) => e.kind === "answer")
    return i >= 0 && (entries[i] as Extract<Entry, { kind: "answer" }>).streaming ? i : -1
  }
  const endAnswer = (interrupted: boolean) => {
    const i = streamingAnswer()
    if (i >= 0) setEntries(i, produce((e) => Object.assign(e, { streaming: false, interrupted })))
  }

  function closeSession() {
    session?.close()
    session = null
  }

  function sendNext() {
    const i = entries.findIndex((e) => e.kind === "question" && e.waiting)
    if (i < 0 || status() === "answering" || paused()) return
    const question = entries[i] as Extract<Entry, { kind: "question" }>
    batch(() => {
      setEntries(i, produce((e) => void ((e as { waiting: boolean }).waiting = false)))
      // The answer sits right after its question, ahead of questions still waiting.
      setEntries(produce((list) => list.splice(i + 1, 0, { kind: "answer", text: "", streaming: true, interrupted: false })))
      setStatus("answering")
      setAnswerStartedAt(Date.now())
    })
    session ??= agent.start({
      text: (chunk) => {
        const a = streamingAnswer()
        if (a >= 0) setEntries(a, produce((e) => void ((e as { text: string }).text += chunk)))
      },
      readFailed: (what) => push({ kind: "note", text: `Read failed: ${what}`, tone: "info" }),
      answerDone: ({ interrupted, usage: answerUsage }) => {
        batch(() => {
          endAnswer(interrupted)
          if (answerUsage) setUsage(answerUsage)
          setStatus("idle")
        })
        sendNext()
      },
      failed: (failure) => {
        // Whatever failed, this session is done; the next question opens another.
        closeSession()
        batch(() => {
          endAnswer(true)
          push({ kind: "note", text: describeFailure(failure), tone: "error" })
          setStatus("failed")
          setPaused(entries.some((e) => e.kind === "question" && e.waiting))
        })
      },
    })
    session.send(question.text, question.position)
  }

  return {
    entries,
    status,
    paused,
    usage,
    clearPrompt,
    activity(): Activity | null {
      if (status() !== "answering") return null
      const answer = entries[streamingAnswer()]
      return {
        phase: answer?.kind === "answer" && answer.text !== "" ? "answering" : "thinking",
        startedAt: answerStartedAt(),
        waiting: entries.filter((e) => e.kind === "question" && e.waiting).length,
      }
    },
    send(text: string) {
      setClearPrompt(null)
      const trimmed = text.trim()
      if (trimmed === "") return
      push({ kind: "question", text: trimmed, waiting: true, position: position() })
      batch(() => {
        if (status() === "failed") setStatus("idle")
        setPaused(false)
      })
      sendNext()
    },
    interrupt() {
      setClearPrompt(null)
      if (status() === "answering") session?.interrupt()
    },
    // The first press asks, the second drops the conversation; any other action cancels.
    newConversation() {
      if (clearPrompt() === null) {
        setClearPrompt(NEW_CONVERSATION_PROMPT)
        return
      }
      closeSession()
      batch(() => {
        setEntries([])
        setStatus("idle")
        setPaused(false)
        setUsage(null)
        setClearPrompt(null)
      })
    },
    cancelNewConversation: () => setClearPrompt(null),
    dispose: closeSession,
  }
}
