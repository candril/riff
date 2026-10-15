/**
 * Columns of context kept between the cursor and the edge it is heading
 * for, so a horizontal move shows what comes next instead of stopping the
 * cursor dead on the last visible column (vim's `sidescrolloff`). Both
 * views read it, so they agree on what "in view" means.
 */
export const SIDE_SCROLL_OFF = 8
