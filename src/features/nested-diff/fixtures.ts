/** Diffs of `.diff` files for the nested view's tests (spec 116). */

const lines = (...rows: string[]) => rows.join("\n")

/** A use case written as its diff, new in the review: observed on the left, the contract on the right. */
export const ADDED_NESTED = lines(
  "diff --git a/Fetch.md.diff b/Fetch.md.diff",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/Fetch.md.diff",
  "@@ -0,0 +1,8 @@",
  "+--- observed",
  "++++ contract",
  "+ # Fetch",
  "+",
  "+-`GET /old`",
  "++`GET /new`",
  "+ | a | b |",
  "+-Errors: none",
)

/** The same file a review later: the contract's route changes, and an observed line goes. */
export const MODIFIED_NESTED = lines(
  "diff --git a/Fetch.md.diff b/Fetch.md.diff",
  "--- a/Fetch.md.diff",
  "+++ b/Fetch.md.diff",
  "@@ -3,6 +3,6 @@",
  "  # Fetch",
  " ",
  " -`GET /old`",
  "-+`GET /new`",
  "++`GET /newer`",
  "  | a | b |",
  "--Errors: none",
  "+ Errors: none",
)

/** A document turning into its diff: the old file deleted, its diff added beside it. */
export const CONVERSION = lines(
  "diff --git a/Fetch.md b/Fetch.md",
  "deleted file mode 100644",
  "--- a/Fetch.md",
  "+++ /dev/null",
  "@@ -1,6 +0,0 @@",
  "-# Fetch",
  "-",
  "-`GET /new` [D1](#deviations)",
  "-",
  "-## Deviations",
  "-| D1 | old route |",
  "diff --git a/Fetch.md.diff b/Fetch.md.diff",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/Fetch.md.diff",
  "@@ -0,0 +1,6 @@",
  "+--- observed",
  "++++ contract",
  "+ # Fetch",
  "+ ",
  "+-`GET /old`",
  "++`GET /new`",
)
