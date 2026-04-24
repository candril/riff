/**
 * External Tools Feature
 *
 * Provides external editor and diff viewer integration.
 * - gf: open file in $EDITOR
 * - gd: open file in external diff viewer (difftastic, delta, nvim)
 */

export {
  handleOpenFileInEditor,
  handleOpenFileAtLine,
  handleOpenExternalDiff,
  handleCheckoutAndEdit,
  type ExternalToolsContext,
} from "./handlers"
