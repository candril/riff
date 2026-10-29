/**
 * The chat column's width. Answers are prose, so it aims a little narrower
 * than the thread panel, and caps at a share of the terminal so the diff
 * keeps most of the screen. A long answer, a code block or a table reads
 * badly wrapped that narrow, so Ctrl-e trades the diff some of its room
 * for an expanded width, wider than the normal one on any screen of 100
 * columns and up.
 */
const CHAT_WIDTH_TARGET = 56
const CHAT_WIDTH_SHARE = 0.4
const CHAT_EXPANDED_WIDTH_TARGET = 88
const CHAT_EXPANDED_WIDTH_SHARE = 0.6
const CHAT_WIDTH_MIN = 40

export function chatColumnWidth(screenWidth: number, expanded: boolean): number {
  const target = expanded ? CHAT_EXPANDED_WIDTH_TARGET : CHAT_WIDTH_TARGET
  const share = expanded ? CHAT_EXPANDED_WIDTH_SHARE : CHAT_WIDTH_SHARE
  return Math.max(CHAT_WIDTH_MIN, Math.min(target, Math.floor(screenWidth * share)))
}
