import { test, expect } from "bun:test"
import { mergeConfig } from "./loader"

test("[board] url overrides where riff board listens", () => {
  const parsed = Bun.TOML.parse(`[board]\nurl = "http://board.test:9000"\n`) as Record<string, unknown>
  expect(mergeConfig(parsed).board.url).toBe("http://board.test:9000")
})

test("without a [board] section riff board is on localhost:4477", () => {
  expect(mergeConfig({}).board.url).toBe("http://localhost:4477")
})
