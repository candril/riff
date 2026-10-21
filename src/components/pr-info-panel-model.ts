import type { PrInfo } from "../providers/github/types"
import type { PRInfoPanelSection } from "../state"
import type { DiffFile } from "../utils/diff-parser"
import type { PreviewSet } from "../utils/previews"
import { checkRows } from "./pr-info-check-rows"
import { fileDiffContext } from "./pr-info-conversation-parts"
import { conversationRows, type ConversationRows } from "./pr-info-conversation-rows"
import { descriptionModel, type DescriptionModel } from "./pr-info-description"
import { sectionHeaderRow, type SectionHeaderRow } from "./pr-info-header"
import {
  visibleRows,
  type ConversationItem,
  type FlatCheckItem,
  type FlatConversationItem,
  type VisibleRows,
} from "./pr-info-items"
import { commitRows, fileRows, previewRows, type ListRows } from "./pr-info-list-rows"
import type { PrInfoNav } from "./pr-info-nav"
import { sectionConfigs } from "./pr-info-sections"

export type ListSection = 'previews' | 'checks' | 'files' | 'commits'

export function isListSection(section: PRInfoPanelSection): section is ListSection {
  return section === 'previews' || section === 'checks' || section === 'files' || section === 'commits'
}

export type SectionBody =
  | { kind: 'description'; model: DescriptionModel }
  | { kind: 'list'; rows: ListRows }
  | { kind: 'conversation'; rows: ConversationRows }

/** One section of the PR info panel as drawn: its header, and its body while it is open. */
export interface PanelSection {
  key: PRInfoPanelSection
  header: SectionHeaderRow
  expanded: boolean
  body: SectionBody | null
}

/**
 * Everything the panel holds that its sections are drawn from. The flat
 * items are the panel's, already fitted to `nav`. The widths are the
 * terminal's rather than the panel's: the rows are cut to them.
 */
export interface PanelInput {
  prInfo: PrInfo
  files: DiffFile[]
  previews: PreviewSet | null
  conversationItems: ConversationItem[]
  hiddenConversationIds: ReadonlySet<string>
  flatConversationItems: FlatConversationItem[]
  flatCheckItems: FlatCheckItem[]
  nav: PrInfoNav
  flashLabels: ReadonlyMap<string, string>
  terminalWidth: number
  listWidth: number
}

export function panelSections(input: PanelInput): PanelSection[] {
  const { nav } = input
  const visible = visibleRows(input, nav.filter)
  return sectionConfigs({
    prInfo: input.prInfo,
    files: input.files,
    previews: input.previews,
    conversationItems: input.conversationItems,
    hiddenConversationIds: input.hiddenConversationIds,
    filter: nav.filter,
  }).map((config) => {
    const active = config.id === nav.activeSection
    const expanded = nav.expandedSections.has(config.id)
    return {
      key: config.id,
      expanded,
      header: sectionHeaderRow(config, {
        active,
        expanded,
        highlighted: active && nav.cursorIndex === -1,
        label: input.flashLabels.get(config.id) ?? null,
      }),
      body: expanded ? sectionBody(config.id, active, input, visible) : null,
    }
  })
}

function sectionBody(section: PRInfoPanelSection, active: boolean, input: PanelInput, visible: VisibleRows): SectionBody {
  const { nav } = input
  if (section === 'description') {
    return { kind: 'description', model: descriptionModel(input.prInfo, { cursor: nav.cursorIndex, active }) }
  }
  const selected = active ? nav.cursorIndex : -1
  if (section === 'conversation') {
    return {
      kind: 'conversation',
      rows: conversationRows(input.flatConversationItems, {
        selected,
        labels: input.flashLabels,
        expanded: nav.expandedContent,
        terminalWidth: input.terminalWidth,
        diffContext: (filename, line) => fileDiffContext(input.files, filename, line),
      }),
    }
  }
  return { kind: 'list', rows: listRows(section, { selected, labels: input.flashLabels }, input, visible) }
}

function listRows(
  section: ListSection,
  rows: { selected: number; labels: ReadonlyMap<string, string> },
  input: PanelInput,
  visible: VisibleRows
): ListRows {
  switch (section) {
    case 'previews':
      return previewRows(visible.previews, rows)
    case 'checks':
      return checkRows(input.flatCheckItems, {
        ...rows,
        expanded: input.nav.expandedCheckIds,
        hasChecks: (input.prInfo.checks ?? []).length > 0,
      })
    case 'files':
      return fileRows(visible.files, { ...rows, listWidth: input.listWidth })
    case 'commits':
      return commitRows(visible.commits, { ...rows, terminalWidth: input.terminalWidth })
  }
}
