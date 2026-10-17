import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"
import { cellsOf } from "../diff-rows/cells"
import { RIGHT_GAP, naturalCells, versionFits } from "./header-fit"
import { headerModel, type HeaderPart, type HeaderProps } from "./header-model"

export type { HeaderProps }

const VERSION_ID = "header-version"

function drawChild(child: HeaderPart[]) {
  return child.length === 1
    ? Text(child[0]!)
    : Box({ flexDirection: "row" }, ...child.map((part) => Text(part)))
}

const contentsOf = (children: HeaderPart[][]) => children.map((child) => child.map((part) => part.content))

/**
 * The one-row header: `left` shrinks and clips, `right` keeps its width,
 * and the version, when given, is shown at the far right only while the
 * rest fits whole beside it. The row decides when it is first laid out
 * and again on every change of width, because nothing re-renders the
 * header on a resize.
 */
function headerRow(left: HeaderPart[][], leftGap: number, right: HeaderPart[][], version: string | undefined) {
  const natural = { left: naturalCells(contentsOf(left), leftGap), right: naturalCells(contentsOf(right), RIGHT_GAP) }
  const fits = (cells: number) => version !== undefined && versionFits(cells, natural, cellsOf(version))
  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: colors.headerBg,
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      onSizeChange() {
        const versionText = this.findDescendantById(VERSION_ID)
        if (versionText) versionText.visible = fits(this.width)
      },
    },
    Box({ flexDirection: "row", gap: leftGap, flexShrink: 1, overflow: "hidden" }, ...left.map(drawChild)),
    Box(
      { flexDirection: "row", gap: RIGHT_GAP, flexShrink: 0 },
      ...right.map(drawChild),
      version !== undefined
        ? Text({ id: VERSION_ID, content: version, fg: theme.overlay0, visible: false })
        : null
    )
  )
}

export function Header(props: HeaderProps = {}) {
  const { left, leftGap, right } = headerModel(props)
  return headerRow(left, leftGap, right, props.version)
}
