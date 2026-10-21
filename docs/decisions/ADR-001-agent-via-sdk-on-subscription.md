# ADR-001: Agent through the Claude Agent SDK on a subscription login

## Status
Accepted

## Context
riff gets a chat with a coding agent beside the diff, which answers questions about the change under review and drafts comments into riff's own composer ([spec 102](../../specs/102-agent-chat.md)). riff is a single-user review tool that runs on the user's own machine. The user has a Claude Max subscription and no wish to pay per token for a tool used every day.

tenor already made this decision for the same user and the same kind of tool: [ADR-002: Agent through the Claude Agent SDK on a subscription login](../../../tenor/docs/decisions/ADR-002-agent-via-sdk-on-subscription.md) (tenor `docs/decisions/ADR-002-agent-via-sdk-on-subscription.md`). riff records the decision again because riff carries its consequences in its own code and build.

Anthropic's rules, as of 2026-10-11 ([legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)): subscription OAuth is for "ordinary use of Claude Code and other native Anthropic applications"; third parties may not offer claude.ai login or route other users' requests through a subscription; products built on the Agent SDK "should use API key authentication". Signing in to the unmodified `claude` binary with one's own subscription is explicitly allowed. Personal, single-user SDK use is not addressed either way.

| Approach | Pros | Cons |
|---|---|---|
| **A. Agent SDK, subscription login.** In-process, streaming input, in-process MCP tools. | <ul><li>Documented multi-turn API, interrupts, resume</li><li>Tools close over riff's state, no IPC</li><li>No per-token cost</li><li>tenor runs the same provider already</li></ul> | <ul><li>Grey area: not a "product", but the docs do not bless it</li><li>Breaks if Anthropic closes the path or `--bare` becomes the SDK default</li></ul> |
| **B. Agent SDK, API key.** | <ul><li>Clearly allowed</li></ul> | <ul><li>Per-token billing for a daily tool</li></ul> |
| **C. Spawn `claude -p --input-format stream-json`.** | <ul><li>The CLI route the docs allow outright</li></ul> | <ul><li>Input message schema undocumented; a hand-rolled protocol</li><li>Tools need an external MCP process</li></ul> |
| **D. Keep `claude` in a tmux split** (spec 036). | <ul><li>Plain use of the unmodified binary</li></ul> | <ul><li>Context frozen at launch, drafts travel through files and the clipboard</li><li>The session behaves like Claude Code: runs `gh`, reviews unasked</li></ul> |

## Decision
A. It is the only route with a documented multi-turn API and no per-token cost, and the usage is personal and single-user, which the prohibitions do not target.

## Consequences
- The agent sits behind an `Agent` interface; the SDK is one implementation, so B or C can replace it without touching the chat.
- The agent's environment drops `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, and riff never passes `--bare`; either silently switches away from the subscription.
- The compiled binary does not autoload `.env` or `bunfig.toml`: riff runs inside the repositories it reviews, and their `.env` could carry an API key.
- riff is never distributed in a way that lets another person use the author's subscription.
