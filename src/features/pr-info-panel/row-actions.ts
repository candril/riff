/**
 * What `Enter`, `o`, `y` and `Y` do on the PR overview's focused row, which
 * depends on the section it is in.
 */

import type { KeyEvent } from "@opentui/core"
import { closePRInfoPanel } from "../../state"
import { copyToClipboard } from "../../utils/clipboard"
import type { PRInfoPanelDeps } from "./actions"

type Deps = PRInfoPanelDeps

/**
 * The key handler is synchronous, so the copy runs detached. The toast waits
 * for the helper to exit rather than firing optimistically: a "copied" toast
 * over an empty clipboard is worse than a late one.
 */
function copyAndToast(deps: Deps, text: string, message: string): void {
  void copyToClipboard(text).then((copied) => {
    if (copied.ok) deps.toast.show(message, "success")
    else deps.toast.show(`Copy failed: ${copied.error}`, "error")
    deps.render()
    setTimeout(() => {
      deps.toast.clear()
      deps.render()
    }, 2000)
  })
}

/** `Enter`: the focused row's own action, per section. `key` is prevented where a picker takes focus. */
export function activate(deps: Deps, key: KeyEvent): void {
  const panel = deps.getPanel()
  if (!panel) return
  const section = panel.getActiveSection()
  switch (section) {
    case 'checks': {
      // Enter on the checks or conversations line opens or folds the rows
      // under it, as on a failing check; the other gate lines have nothing
      // to open.
      if (panel.toggleSelectedPoint()) {
        deps.render()
        break
      }
      // An unresolved thread under the conversations line opens where Enter
      // on it in the Conversation section would (spec 108).
      const thread = panel.getSelectedMergeThread()
      if (thread) {
        if (deps.onOpenThread) {
          deps.setState(closePRInfoPanel)
          deps.render()
          deps.onOpenThread(thread.id)
        }
        break
      }
      // Enter on an annotation opens the file at that line in
      // $EDITOR (spec 043). We deliberately don't route through
      // the diff view — error sites are often in code the PR
      // didn't touch, so the file isn't in `state.files`. Enter
      // on a failing check row toggles its annotation list
      // (same "no location → toggle expand" pattern conversation
      // uses); Enter on any other check row opens the browser.
      const ann = panel.getSelectedAnnotation()
      if (ann && deps.onOpenFileAtLine) {
        // Don't close the panel — $EDITOR is external, and on
        // return the user wants to stay on the annotation they
        // just inspected (spec 043).
        deps.onOpenFileAtLine(ann.annotation.path, ann.annotation.startLine)
        break
      }
      const check = panel.getSelectedCheck()
      if (check && panel.getSelectedAnnotation() === null) {
        if (check.status === "completed" && (
          check.conclusion === "failure" ||
          check.conclusion === "timed_out" ||
          check.conclusion === "action_required"
        )) {
          panel.toggleCheckExpansion(check.id)
          deps.render()
          break
        }
      }
      if (check?.detailsUrl) {
        Bun.spawn(["open", check.detailsUrl])
      }
      break
    }
    case 'previews': {
      const preview = panel.getSelectedPreview()
      if (preview) {
        // The palette's picker takes focus in this same keypress.
        key.preventDefault()
        deps.onPreviewRow?.("open", preview)
      }
      break
    }
    case 'files': {
      const file = panel.getSelectedFile()
      if (file && deps.onJumpToFile) {
        deps.setState(closePRInfoPanel)
        deps.render()
        deps.onJumpToFile(file.filename)
      }
      break
    }
    case 'commits': {
      const commit = panel.getSelectedCommit()
      if (commit && deps.onActivateCommit) {
        deps.setState(closePRInfoPanel)
        deps.render()
        deps.onActivateCommit(commit.sha)
      }
      break
    }
    case 'conversation': {
      // Enter on a thread opens the thread view (the inline comment
      // overlay) on its anchor — same surface Enter gives on a
      // commented diff line and on a comments-picker hit.
      const flat = panel.getSelectedFlatItem?.()
      if (flat?.type === 'review-thread' && deps.onOpenThread) {
        deps.setState(closePRInfoPanel)
        deps.render()
        deps.onOpenThread(flat.data.id)
        break
      }
      // Anything else (PR comment, review header, pending reviewers)
      // has no thread of its own — expand it in place. For a review
      // header that reveals its threads, which Enter then opens.
      panel.toggleSelectedThread()
      break
    }
  }
}

/** `o`: the focused row in the browser, per section. `key` is prevented where a picker takes focus. */
export function openFocused(deps: Deps, key: KeyEvent): void {
  const panel = deps.getPanel()
  const { prInfo } = deps.getState()
  if (!panel || !prInfo) return
  const section = panel.getActiveSection()
  switch (section) {
    case 'checks': {
      // `o` on an annotation prefers the raw log line URL; falls
      // back to the check's details URL (spec 043).
      const ann = panel.getSelectedAnnotation()
      if (ann) {
        const url = ann.annotation.rawDetailsUrl ?? ann.check.detailsUrl
        if (url) Bun.spawn(["open", url])
        break
      }
      const thread = panel.getSelectedMergeThread()
      if (thread) {
        // A local thread has no page on GitHub to open.
        if (thread.githubUrl) Bun.spawn(["open", thread.githubUrl])
        break
      }
      const check = panel.getSelectedCheck()
      if (check?.detailsUrl) {
        Bun.spawn(["open", check.detailsUrl])
      }
      break
    }
    case 'previews': {
      const preview = panel.getSelectedPreview()
      if (preview) {
        // The palette's picker takes focus in this same keypress.
        key.preventDefault()
        deps.onPreviewRow?.("open", preview)
      }
      break
    }
    case 'commits': {
      const commit = panel.getSelectedCommit()
      if (commit) {
        const { owner, repo } = prInfo
        const url = `https://github.com/${owner}/${repo}/commit/${commit.sha}`
        Bun.spawn(["open", url])
      }
      break
    }
    case 'files': {
      const file = panel.getSelectedFile()
      if (file) {
        const { owner, repo, number } = prInfo
        const url = `https://github.com/${owner}/${repo}/pull/${number}/files#diff-${file.filename.replace(/\//g, '-')}`
        Bun.spawn(["open", url])
      }
      break
    }
    case 'conversation': {
      const item = panel.getSelectedConversationItem()
      if (item && item.type !== 'pending-reviewer') {
        const url = item.type === 'pr-comment'
          ? item.data.url
          : item.data.threads[0]?.url
        if (url) Bun.spawn(["open", url])
      }
      break
    }
    default:
      // Open PR itself
      Bun.spawn(["open", prInfo.url])
  }
}

function focusedPreviewWithLinks(panel: NonNullable<ReturnType<Deps["getPanel"]>>) {
  const preview = panel.getActiveSection() === 'previews' ? panel.getSelectedPreview() : undefined
  return preview && preview.links.length > 0 ? preview : undefined
}

/**
 * `y`: what the focused row names, per section, or the PR URL where it
 * names nothing. A preview row with several links asks which (spec 068),
 * in a picker that takes focus in this same keypress, so `key` is prevented.
 */
export function copyFocused(deps: Deps, key: KeyEvent): void {
  const panel = deps.getPanel()
  const { prInfo } = deps.getState()
  if (!panel || !prInfo) return
  const preview = focusedPreviewWithLinks(panel)
  if (preview) {
    key.preventDefault()
    deps.onPreviewRow?.("copy", preview)
    return
  }
  const section = panel.getActiveSection()
  let copied = false
  switch (section) {
    case 'checks': {
      // `y` on an annotation copies `path:line`; on a check row
      // copies the check's details URL (spec 043).
      const ann = panel.getSelectedAnnotation()
      if (ann) {
        const loc = `${ann.annotation.path}:${ann.annotation.startLine}`
        copyAndToast(deps, loc, `Copied ${loc}`)
        copied = true
        break
      }
      const thread = panel.getSelectedMergeThread()
      if (thread) {
        copyAndToast(deps, thread.body, "Comment copied")
        copied = true
        break
      }
      const check = panel.getSelectedCheck()
      if (check?.detailsUrl) {
        copyAndToast(deps, check.detailsUrl, `Copied ${check.name} URL`)
        copied = true
      }
      break
    }
    case 'commits': {
      const commit = panel.getSelectedCommit()
      if (commit) {
        copyAndToast(deps, commit.sha, `Copied ${commit.sha}`)
        copied = true
      }
      break
    }
    case 'files': {
      const file = panel.getSelectedFile()
      if (file) {
        copyAndToast(deps, file.filename, `Copied ${file.filename}`)
        copied = true
      }
      break
    }
    case 'conversation': {
      const item = panel.getSelectedConversationItem()
      if (item && item.type !== 'pending-reviewer') {
        const body = item.type === 'pr-comment'
          ? item.data.body
          : (item.data.body || item.data.threads[0]?.body || '')
        if (body) {
          copyAndToast(deps, body, "Comment copied")
          copied = true
        }
      }
      break
    }
  }
  if (!copied) {
    copyAndToast(deps, prInfo.url, "PR URL copied")
  }
}

/** `Y`: every link on a preview row at once (spec 068), the PR URL anywhere else. */
export function copyAll(deps: Deps): void {
  const panel = deps.getPanel()
  const { prInfo } = deps.getState()
  if (!panel || !prInfo) return
  const preview = focusedPreviewWithLinks(panel)
  if (preview) {
    const urls = preview.links.map((link) => link.url).join("\n")
    copyAndToast(deps, urls, `Copied ${preview.links.length} URLs`)
    return
  }
  copyAndToast(deps, prInfo.url, "PR URL copied")
}
