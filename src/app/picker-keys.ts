import type { RiffKeymap } from "./keymap"
import type { AppKeyContext } from "./key-context"
import { switchView } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { registerFilePickerKeys } from "../features/file-picker"
import { jumpToComment, registerCommentsPickerKeys } from "../features/comments-picker"
import { jumpToMark, registerMarksPickerKeys } from "../features/marks"
import { jumpToOccurrence, registerOccurrencePickerKeys } from "../features/occurrence-picker"
import * as fileNavigation from "../features/file-navigation"

/** The four query pickers' layers, wired to the jumps they end in. */
export function registerPickerKeys(riffKeymap: RiffKeymap, ctx: AppKeyContext): void {
  const { getState, setState, render } = ctx
  const jumpContext = () => ({
    getState: ctx.getState,
    setState: ctx.setState,
    getVimState: ctx.getVimState,
    setVimState: ctx.setVimState,
    getLineMapping: ctx.getLineMapping,
    ensureCursorVisible: ctx.ensureCursorVisible,
    render: ctx.render,
    fileNavContext: ctx.fileNavContext,
  })

  // Later registration wins, for layers and captures alike. The file picker
  // outranks comments, comments outrank marks and marks occurrences, so
  // they register in the reverse order.
  registerOccurrencePickerKeys(riffKeymap, {
    getState,
    setState,
    render,
    onSelectHit: (hit) => jumpToOccurrence(hit, jumpContext()),
  })
  registerMarksPickerKeys(riffKeymap, {
    getState,
    setState,
    render,
    onJump: (letter) => {
      // A mark is a place in the diff, so going to one leaves the overview or the feed.
      if (ctx.getState().viewMode !== "diff") ctx.setState((s) => switchView(s, "diff"))
      jumpToMark(letter, ctx.marksContext)
    },
    save: (marks) => ctx.marksContext.save(marks),
  })
  registerCommentsPickerKeys(riffKeymap, {
    getState,
    commentsPicker: ctx.commentsPicker,
    render,
    onSelectComment: (comment) => jumpToComment(comment, jumpContext()),
  })
  registerFilePickerKeys(riffKeymap, {
    getState,
    setState,
    filePicker: ctx.filePicker,
    render,
    onFileSelected: () => {
      ctx.setVimState(createCursorState())
      ctx.rebuildLineMapping()
    },
    revealFile: (fileIndex) => {
      // Picking a file is asking to read it, and files live in the
      // diff: from the overview or the feed, that is where it lands.
      // The scroll waits for the diff to be built, or it is measured
      // against a view that is not on screen yet and lands elsewhere.
      if (ctx.getState().viewMode === "diff") {
        fileNavigation.revealFile(fileIndex, ctx.fileNavContext)
        return
      }
      ctx.setState((s) => switchView(s, "diff"))
      ctx.render()
      // The scroll waits for revealFile, which puts the cursor on the
      // file and draws it: placed before that, it would put whatever
      // line the cursor left at the top.
      ctx.cursorView.onceRebuilt(() => ctx.cursorView.scrollCursorTo(ctx.getVimState().line, "top"))
      fileNavigation.revealFile(fileIndex, ctx.fileNavContext)
    },
  })
}
