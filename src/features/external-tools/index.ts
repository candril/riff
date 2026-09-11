/**
 * External Tools Feature
 *
 * Provides external editor and diff viewer integration.
 * - ge: open the current file in $EDITOR
 * - gE: the same in a new tmux window, keeping riff running
 * - gd: open file in external diff viewer (difftastic, delta, nvim)
 */

export {
  handleOpenFileInEditor,
  handleDiffFileInEditor,
  handleOpenFileInTmuxWindow,
  handleOpenPathInTmuxWindow,
  handleOpenFileAtLine,
  handleOpenExternalDiff,
  handleCheckoutAndEdit,
  type ExternalToolsContext,
} from "./handlers"
