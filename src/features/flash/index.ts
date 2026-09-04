/**
 * Flash Feature
 *
 * flash.nvim-style jump navigation: `s` dims the diff, typing labels every
 * visible match with a home-row key, and pressing that key jumps there.
 * The jump logic lives in vim-diff/flash-handler.
 */

export { handleInput, type FlashInputContext } from "./input"
