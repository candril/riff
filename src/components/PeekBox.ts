import { Box, Text, h, CodeRenderable, type SyntaxStyle } from "@opentui/core"
import { colors, theme } from "../theme"
import type { PeekModel, PeekTone } from "./peek-model"

export const PEEK_TONE: Record<PeekTone, string> = {
  primary: colors.primary,
  dim: colors.textDim,
  text: colors.text,
  green: theme.green,
  red: theme.red,
  blue: theme.blue,
  peach: theme.peach,
  yellow: theme.yellow,
}

/** A peek over a dimmed screen, from its model. */
export function peekBox(model: PeekModel, { syntaxStyle, zIndex }: { syntaxStyle?: SyntaxStyle; zIndex?: number } = {}) {
  const { body } = model
  if (body.kind === "code" && !syntaxStyle) throw new Error(`${model.id} draws code and needs a syntax style`)
  return Box(
    {
      id: model.id,
      position: "absolute",
      ...(zIndex !== undefined ? { zIndex } : {}),
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
    },
    Box({
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "#00000080",
    }),
    Box(
      {
        flexDirection: "column",
        backgroundColor: theme.base,
        paddingTop: 1,
        paddingBottom: 1,
        paddingLeft: 2,
        paddingRight: 2,
        width: model.width,
      },
      Box(
        { height: 1, marginBottom: 1, flexDirection: "row", gap: 1 },
        ...model.header.map(({ text, tone }) => Text({ content: text, fg: PEEK_TONE[tone] }))
      ),
      ...(body.kind === "code"
        ? [
            // Highlighted rather than plain, because the point of reading the
            // line here is to read it as code. Wrapped on words — most long
            // lines worth peeking at are prose, and a token with no break in it
            // still gets broken at the edge.
            h(CodeRenderable, {
              id: "line-peek-code",
              content: body.content,
              filetype: body.filetype,
              syntaxStyle: syntaxStyle!,
              drawUnstyledText: true,
              conceal: false,
              wrapMode: "word",
              width: body.width,
            }),
          ]
        : // Pre-rendered, so each row is one Text of its own: an absolutely
          // positioned box sizes itself as if every child were a single row.
          body.rows.map(({ text, tone }) => Box({ height: 1 }, Text({ content: text, fg: PEEK_TONE[tone] })))),
      Box({ height: 1, marginTop: 1 }, Text({ content: model.footer, fg: colors.textDim }))
    )
  )
}
