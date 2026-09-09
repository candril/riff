import { TextRenderable, type CliRenderer } from "@opentui/core"
import type { MarkdownOptions } from "@opentui/core"
import { theme } from "../theme"
import { renderMarkdownTable, type TableModel } from "../utils/markdown-table-render"
import type { CellAlignment } from "../utils/markdown-tables"

/**
 * Draw markdown tables ourselves wherever riff renders markdown.
 *
 * OpenTUI's table renderer gives every cell one row and cuts what does not
 * fit — silently, so a comment with a table in it loses most of its text
 * and reads as if the author wrote only the first half of every cell.
 * Ours wraps instead.
 */
export function tableRenderer(
  renderer: CliRenderer,
  width: () => number
): NonNullable<MarkdownOptions["renderNode"]> {
  return (token) => {
    if (token.type !== "table") return undefined

    const model = toModel(token)
    if (!model) return undefined

    return new TextRenderable(renderer, {
      content: renderMarkdownTable(model, width()).join("\n"),
      fg: theme.text,
    })
  }
}

/**
 * marked's table token, as the cells it holds. `text` is the cell's own
 * source, which is what the renderer wants — it does its own inline work.
 */
function toModel(token: unknown): TableModel | null {
  const table = token as {
    header?: Array<{ text?: string; align?: string | null }>
    rows?: Array<Array<{ text?: string }>>
  }
  if (!table.header?.length) return null

  return {
    header: table.header.map((cell) => cell.text ?? ""),
    rows: (table.rows ?? []).map((row) => row.map((cell) => cell.text ?? "")),
    alignments: table.header.map((cell) => alignment(cell.align)),
  }
}

function alignment(align: string | null | undefined): CellAlignment {
  return align === "right" || align === "center" || align === "left" ? align : "default"
}
