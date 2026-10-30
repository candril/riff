import { renderMarkdown } from "../features/rendered-markdown/render"
import type { DiffLineMappingOptions } from "../vim-diff/types"

/** A new README with a flowchart between a heading and a paragraph, shown rendered. */
export const MERMAID_README = ["# Flow", "", "```mermaid", "graph TD", "  Start --> Done", "```", "", "After the chart."].join(
  "\n"
)

export const MERMAID_README_DIFF = [
  "diff --git a/README.md b/README.md",
  "new file mode 100644",
  "index 0000000..2222222",
  "--- /dev/null",
  "+++ b/README.md",
  "@@ -0,0 +1,8 @@",
  ...MERMAID_README.split("\n").map((line) => `+${line}`),
  "",
].join("\n")

export const mermaidReadmeRendered = (): DiffLineMappingOptions => ({
  outsideDiff: true,
  fileContents: new Map([["README.md", MERMAID_README]]),
  renderedFiles: new Map([["README.md", renderMarkdown(MERMAID_README)]]),
})
