import { expect, test } from "bun:test"
import { suggestionsInFileLanguage } from "./suggestion-fence"

test("a suggestion fence reads as the commented file's language", () => {
  const body = "Simpler:\n```suggestion\nreturn x\n```\n"
  expect(suggestionsInFileLanguage(body, "src/a.ts")).toBe("Simpler:\n```typescript\nreturn x\n```\n")
})

test("a four-backtick or tilde fence keeps its own marker", () => {
  expect(suggestionsInFileLanguage("````suggestion\nx\n````", "a.py")).toBe("````python\nx\n````")
  expect(suggestionsInFileLanguage("~~~suggestion\nx\n~~~", "a.go")).toBe("~~~go\nx\n~~~")
})

test("other fences, and a file riff has no language for, are left alone", () => {
  expect(suggestionsInFileLanguage("```sh\nls\n```", "a.ts")).toBe("```sh\nls\n```")
  expect(suggestionsInFileLanguage("```suggestions\nx\n```", "a.ts")).toBe("```suggestions\nx\n```")
  expect(suggestionsInFileLanguage("```suggestion\nx\n```", "Makefile")).toBe("```suggestion\nx\n```")
})
