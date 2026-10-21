import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"

// The SDK reads questions from an async iterable for the whole session; this one waits for the
// next question instead of ending, so the session stays open between turns.
export class Inbox implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = []
  private wake: (() => void) | undefined
  private closed = false

  push(text: string) {
    this.queue.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
    })
    this.wake?.()
  }

  close() {
    this.closed = true
    this.wake?.()
  }

  async *[Symbol.asyncIterator]() {
    while (!this.closed) {
      while (this.queue.length > 0) {
        yield this.queue.shift()!
      }
      await new Promise<void>((resolve) => (this.wake = resolve))
    }
  }
}
