import type { AppMode } from "../../types"

/**
 * Whether riff should ask the terminal for focus events (DECSET 1004) at all;
 * only worth it when something acts on them. The startup mode suffices: a
 * review that starts on a PR never turns local, while a local one can turn PR.
 */
export function reportsFocus(poll: { onFocus: boolean; interval: number }, startMode: AppMode): boolean {
  return poll.onFocus && (poll.interval > 0 || startMode === "local")
}

/**
 * Route a focus change to the review riff shows at that moment: the poll
 * hears every change, and a regain on a local review also reloads it.
 */
export function focusHandler(ctx: {
  appMode: () => AppMode
  setPollFocused: (focused: boolean) => void
  reloadLocal: () => void
}): (focused: boolean) => void {
  // Terminals without focus reporting never send an event, so the only safe
  // starting assumption is that the user is looking at us.
  let focused = true
  return (next) => {
    const regained = next && !focused
    focused = next
    ctx.setPollFocused(next)
    if (regained && ctx.appMode() === "local") ctx.reloadLocal()
  }
}
