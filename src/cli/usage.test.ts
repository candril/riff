import { expect, test } from "bun:test"
import { runUsageCli, USAGE_USAGE } from "./usage"

function run(args: string[]) {
  const out: string[] = []
  const errors: string[] = []
  const code = runUsageCli(args, {
    load: () => ({ since: "2026-11-01T00:00:00.000Z", keys: { "gchord.refresh": 5 }, palette: {} }),
    out: (text) => void out.push(text),
    error: (line) => void errors.push(line),
  })
  return { code, out, errors }
}

test("--json prints the report for a script to read", () => {
  const { code, out } = run(["--json"])

  expect(code).toBe(0)
  const report = JSON.parse(out[0]!)
  expect(report.actions.find((row: { id: string }) => row.id === "refresh")).toMatchObject({ byKey: 5, byPalette: 0 })
})

test("anything else it does not know is a usage error", () => {
  expect(run(["--yaml"])).toMatchObject({ code: 1, errors: [USAGE_USAGE] })
})
