/**
 * External Tools Feature
 *
 * Provides external editor and diff viewer integration.
 * - gf: open file in $EDITOR
 * - gF: open file in $EDITOR in a new tmux window, keeping riff running
 * - gd: open file in external diff viewer (difftastic, delta, nvim)
 */

export {
  handleOpenFileInEditor,
  handleOpenFileInTmuxWindow,
  handleOpenFileAtLine,
  handleOpenExternalDiff,
  handleCheckoutAndEdit,
  type ExternalToolsContext,
} from "./handlers"
