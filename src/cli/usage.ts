/**
 * `riff usage` (spec 117): which actions get used, from the counts riff
 * keeps in ~/.riff/usage.json. Reads only; never starts the TUI.
 */

import { actions } from "../actions/registry"
import { formatUsageReport, usageReport } from "../features/usage/report"
import type { UsageCounts } from "../features/usage/counts"
import { loadUsage } from "../storage/usage"

export const USAGE_USAGE = "usage: riff usage [--json]"

export interface UsageCliDeps {
  load: () => UsageCounts | null
  out: (text: string) => void
  error: (line: string) => void
}

const liveDeps: UsageCliDeps = {
  load: () => loadUsage(),
  out: (text) => console.log(text),
  error: (line) => console.error(line),
}

export function runUsageCli(args: string[], deps: UsageCliDeps = liveDeps): number {
  const json = args[0] === "--json"
  if (args.length > (json ? 1 : 0)) {
    deps.error(USAGE_USAGE)
    return 1
  }
  const report = usageReport(deps.load(), actions)
  deps.out(json ? JSON.stringify(report, null, 2) : formatUsageReport(report))
  return 0
}
