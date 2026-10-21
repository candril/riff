/**
 * The chat column's width. Answers are prose, so it aims a little narrower
 * than the thread panel, and caps at a share of the terminal so the diff
 * keeps most of the screen.
 */
const CHAT_WIDTH_TARGET = 56
const CHAT_WIDTH_MIN = 40

export function chatColumnWidth(screenWidth: number): number {
  return Math.max(CHAT_WIDTH_MIN, Math.min(CHAT_WIDTH_TARGET, Math.floor(screenWidth * 0.4)))
}
