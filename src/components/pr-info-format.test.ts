import { describe, expect, test } from "bun:test"
import type { PrCheck } from "../providers/github"
import { theme } from "../theme"
import { cleanBodyPreview, formatDateTime, formatTimeAgo, getCheckStatusDisplay, truncate } from "./pr-info-format"

const NOW = Date.parse("2026-03-01T12:00:00Z")
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()
const DAY = 24 * 60

describe("formatTimeAgo", () => {
  test("reads under a minute as now", () => {
    expect(formatTimeAgo(minutesAgo(0), NOW)).toBe("now")
    expect(formatTimeAgo(new Date(NOW - 59_000).toISOString(), NOW)).toBe("now")
  })

  test("counts minutes up to 59, then hours", () => {
    expect(formatTimeAgo(minutesAgo(1), NOW)).toBe("1m")
    expect(formatTimeAgo(minutesAgo(59), NOW)).toBe("59m")
    expect(formatTimeAgo(minutesAgo(60), NOW)).toBe("1h")
  })

  test("counts hours up to 23, then days", () => {
    expect(formatTimeAgo(minutesAgo(23 * 60 + 59), NOW)).toBe("23h")
    expect(formatTimeAgo(minutesAgo(DAY), NOW)).toBe("1d")
  })

  test("counts days up to 29, then 30-day months", () => {
    expect(formatTimeAgo(minutesAgo(29 * DAY), NOW)).toBe("29d")
    expect(formatTimeAgo(minutesAgo(30 * DAY), NOW)).toBe("1mo")
    expect(formatTimeAgo(minutesAgo(364 * DAY), NOW)).toBe("12mo")
  })

  test("counts years from 365 days", () => {
    expect(formatTimeAgo(minutesAgo(365 * DAY), NOW)).toBe("1y")
    expect(formatTimeAgo(minutesAgo(800 * DAY), NOW)).toBe("2y")
  })
})

describe("formatDateTime", () => {
  test("gives the time of day for the same day", () => {
    expect(formatDateTime(minutesAgo(90), NOW)).toMatch(/^\d{1,2}:\d{2}/)
  })

  test("gives days ago under a week", () => {
    expect(formatDateTime(minutesAgo(DAY), NOW)).toBe("1d ago")
    expect(formatDateTime(minutesAgo(6 * DAY + 60), NOW)).toBe("6d ago")
  })

  test("gives the date from a week on", () => {
    const shown = formatDateTime(minutesAgo(7 * DAY), NOW)
    expect(shown).toContain("Feb")
    expect(shown).toContain("22")
  })
})

describe("truncate", () => {
  test("keeps a string of exactly the length", () => {
    expect(truncate("abcde", 5)).toBe("abcde")
  })

  test("cuts one over to the length, ending in an ellipsis", () => {
    expect(truncate("abcdef", 5)).toBe("abcd…")
  })
})

describe("cleanBodyPreview", () => {
  test("drops HTML comments", () => {
    expect(cleanBodyPreview("<!-- template -->Fixes the build")).toBe("Fixes the build")
  })

  test("keeps a link's text", () => {
    expect(cleanBodyPreview("See [the docs](https://example.com) first")).toBe("See the docs first")
  })

  test("drops heading markers", () => {
    expect(cleanBodyPreview("## Summary\nShort")).toBe("Summary Short")
  })

  test("drops table cells and separators", () => {
    expect(cleanBodyPreview("Before\n| Name |\n| :---: |\n| x |\nAfter")).toBe("Before After")
  })

  test("drops backticks", () => {
    expect(cleanBodyPreview("Run `bun test` or ```sh```")).toBe("Run bun test or sh")
  })
})

describe("getCheckStatusDisplay", () => {
  const check = (over: Partial<PrCheck>): PrCheck => ({
    id: 1,
    name: "build",
    status: "completed",
    conclusion: "success",
    detailsUrl: null,
    startedAt: null,
    completedAt: null,
    ...over,
  })

  test.each([
    ["success", "✓", theme.green],
    ["failure", "✗", theme.red],
    ["timed_out", "✗", theme.red],
    ["cancelled", "⊘", theme.overlay0],
    ["skipped", "⊘", theme.overlay0],
    ["neutral", "◇", theme.subtext0],
    ["action_required", "!", theme.peach],
    [null, "?", theme.overlay0],
  ] as const)("a completed check concluding %p shows %p", (conclusion, icon, color) => {
    expect(getCheckStatusDisplay(check({ conclusion }))).toEqual({ icon, color })
  })

  test("a queued or running check shows a yellow circle, whatever it concluded", () => {
    expect(getCheckStatusDisplay(check({ status: "in_progress", conclusion: null }))).toEqual({ icon: "○", color: theme.yellow })
    expect(getCheckStatusDisplay(check({ status: "queued", conclusion: "failure" }))).toEqual({ icon: "○", color: theme.yellow })
  })
})
