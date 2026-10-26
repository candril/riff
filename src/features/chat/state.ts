import { batch, createSignal } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { Agent, AgentSession, Usage } from "../../providers/agent/agent"
import type { Position } from "../../providers/agent/position"
import { describeFailure, type Entry } from "./entries"
import type { Expanded } from "./references"
import type { SavedChat, SavedEntry } from "../../storage/chat"

export type { Entry } from "./entries"

export interface Activity {
  phase: "thinking" | "answering"
  startedAt: number
  waiting: number
}

export type AgentStatus = "idle" | "answering" | "failed"

export type ChatState = ReturnType<typeof createChatState>

export const NEW_CONVERSATION_PROMPT = "Press Ctrl-n again to start a new conversation"

export const SESSION_LOST_NOTE =
  "The earlier session is gone; this question starts a new one, which does not know the conversation above."

/** Where the review's conversation is kept between launches, and the PR head the agent should know about. */
export interface ChatContinuity {
  saved: SavedChat | null
  head: () => string | null
  save(chat: SavedChat): void
  // On the way out, where a queued write would not land before the process ends.
  saveNow(chat: SavedChat): void
  clear(): void
}

const short = (sha: string) => sha.slice(0, 7)

function restored(entry: SavedEntry): Entry {
  return entry.kind === "question"
    ? { kind: "question", text: entry.text, waiting: false, position: null, attachments: [], labels: [...entry.labels] }
    : { kind: "answer", text: entry.text, streaming: false, interrupted: entry.interrupted }
}

function saved(entry: Entry): SavedEntry[] {
  if (entry.kind === "question") {
    const labels = [entry.position?.label, ...entry.labels].filter((label): label is string => !!label)
    return [{ kind: "question", text: entry.text, labels }]
  }
  if (entry.kind === "answer") {
    return [{ kind: "answer", text: entry.text, interrupted: entry.interrupted || entry.streaming }]
  }
  return []
}

/**
 * One conversation with riff's agent. The session opens on the first
 * question, not before: opening the chat costs nothing until something is
 * asked. `position` is read once per question, when it is sent, and its
 * `@` tokens are expanded against that same position.
 */
export function createChatState(
  agent: Agent,
  position: () => Position | null = () => null,
  expand: (text: string, position: Position | null) => Expanded = () => ({ attachments: [], labels: [] }),
  continuity?: ChatContinuity,
) {
  const [entries, setEntries] = createStore<Entry[]>(continuity?.saved?.entries.map(restored) ?? [])
  const [status, setStatus] = createSignal<AgentStatus>("idle")
  // After a failure the queue holds still until the reviewer asks again.
  const [paused, setPaused] = createSignal(false)
  const [usage, setUsage] = createSignal<Usage | null>(null)
  const [answerStartedAt, setAnswerStartedAt] = createSignal(0)
  const [clearPrompt, setClearPrompt] = createSignal<string | null>(null)
  let session: AgentSession | null = null
  const sessionClosed = new Set<() => void>()
  let sessionId = continuity?.saved?.sessionId ?? null
  // Only the first session resumes: one opened after a failure starts fresh, as describeFailure tells the reviewer.
  let resumeId = sessionId
  let toldHead = continuity?.saved?.headSha ?? null

  const snapshot = (): SavedChat => ({ sessionId, headSha: toldHead, entries: entries.flatMap(saved) })
  const save = () => continuity?.save(snapshot())

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
    if (!session) return
    session.close()
    session = null
    sessionClosed.forEach((listener) => listener())
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
    const attachments = [...question.attachments]
    const head = continuity?.head() ?? null
    if (toldHead !== null && head !== null && toldHead !== head) {
      attachments.unshift(
        `New commits on the PR since this conversation last spoke about it: head moved from ${short(toldHead)} to ${short(head)}. Re-read what you need with the tools.`,
      )
      const label = `new commits ${short(toldHead)}..${short(head)}`
      setEntries(i, produce((e) => void (e as { labels: string[] }).labels.push(label)))
    }
    if (head !== null) toldHead = head
    session ??= openSession()
    session.send(question.text, question.position, attachments)
  }

  function openSession(): AgentSession {
    const resume = resumeId
    resumeId = null
    return agent.start({
      sessionStarted: (id) => {
        sessionId = id
        save()
      },
      sessionLost: () => push({ kind: "note", text: SESSION_LOST_NOTE, tone: "info" }),
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
        save()
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
        save()
      },
    }, resume)
  }

  return {
    /** Where the reviewer is, as the next question would carry it. */
    position,
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
    /** False when the question did not go: it was blank, or one of its `@` tokens named nothing. */
    send(text: string): boolean {
      setClearPrompt(null)
      const trimmed = text.trim()
      if (trimmed === "") return false
      const at = position()
      const expanded = expand(trimmed, at)
      if ("error" in expanded) {
        push({ kind: "note", text: expanded.error, tone: "error" })
        return false
      }
      push({ kind: "question", text: trimmed, waiting: true, position: at, ...expanded })
      batch(() => {
        if (status() === "failed") setStatus("idle")
        setPaused(false)
      })
      sendNext()
      save()
      return true
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
      sessionId = null
      resumeId = null
      toldHead = null
      continuity?.clear()
      batch(() => {
        setEntries([])
        setStatus("idle")
        setPaused(false)
        setUsage(null)
        setClearPrompt(null)
      })
    },
    cancelNewConversation: () => setClearPrompt(null),
    /** Something riff did for the agent, or noticed about it, said in the conversation. */
    note: (text: string, tone: "error" | "info" = "info") => push({ kind: "note", text, tone }),
    // A tool call still waiting on the reviewer belongs to the session; it has no one to answer once that closes.
    onSessionClosed: (listener: () => void) => void sessionClosed.add(listener),
    dispose() {
      closeSession()
      if (entries.some((e) => e.kind !== "note") || sessionId !== null) continuity?.saveNow(snapshot())
    },
  }
}
