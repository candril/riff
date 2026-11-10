import { describe, expect, test } from "bun:test"
import { usePrInfoPanel } from "../testing/pr-info-panel"
import { find } from "../testing/pr-info-panel"

const mount = usePrInfoPanel()

describe("revealConversationItem (spec 115)", () => {
  test("a conversation comment's link stands on it, opened, with its section open", async () => {
    let found = false
    const { panel, lines } = await mount({
      prepare: (panel) => {
        found = panel.revealConversationItem((item) => item.type === "pr-comment" && item.data.id === 501)
      },
    })
    expect(found).toBe(true)
    expect(panel.getActiveSection()).toBe("conversation")
    const selected = panel.getSelectedConversationItem()
    expect(selected?.type === "pr-comment" && selected.data.id).toBe(501)
    expect(panel.rowNodes()[panel.getCursorIndex()]?.open).toBe(true)
    // Opened, the comment shows its body past the first line.
    find(lines, "- two")
  })

  test("a review's link stands on its header", async () => {
    const { panel } = await mount({
      prepare: (panel) => {
        panel.revealConversationItem((item) => item.type === "review-header" && item.data.databaseId === 104)
      },
    })
    const selected = panel.getSelectedFlatItem()
    expect(selected?.type === "review-header" && selected.data.author).toBe("carol")
  })

  test("a filter that hides the row is cleared", async () => {
    const { panel } = await mount({
      prepare: (panel) => {
        panel.setFilter("Deployed")
        panel.revealConversationItem((item) => item.type === "pr-comment" && item.data.id === 501)
      },
    })
    expect(panel.getFilter()).toBe("")
    const selected = panel.getSelectedConversationItem()
    expect(selected?.type === "pr-comment" && selected.data.id).toBe(501)
  })

  test("a row that is not there is reported, and the cursor stays off the rows", async () => {
    let found = true
    await mount({
      prepare: (panel) => {
        found = panel.revealConversationItem((item) => item.type === "pr-comment" && item.data.id === 999)
      },
    })
    expect(found).toBe(false)
  })
})
