/** Diffs the frame tests of both views draw, so the two can be read against each other. */

export const TWO_FILES = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,5 +1,5 @@
 export function greet(name: string) {
-  return "Hello " + name
+  return \`Hello \${name}\`
 }
+
 export const version = 1
diff --git a/src/farewell.ts b/src/farewell.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/farewell.ts
@@ -0,0 +1,3 @@
+export function farewell(name: string) {
+  return "Bye " + name
+}
`

export const FAR_HUNK = `diff --git a/schema.graphql b/schema.graphql
index 1111111..2222222 100644
--- a/schema.graphql
+++ b/schema.graphql
@@ -503,4 +503,5 @@ type TvAddOn {
   trackingId: Long @semanticNonNull
+  showSkipAdsChannelList: Boolean @semanticNonNull
   "Catalogue price, before any discount."
   monthlyPrice: Money @semanticNonNull
`

const WIDE_TEXT = Array.from({ length: 20 }, (_, i) => `col${String(i * 10).padStart(3, "0")}..`).join("")
export const ONE_WIDE_LINE = `diff --git a/wide.ts b/wide.ts
index 1111111..2222222 100644
--- a/wide.ts
+++ b/wide.ts
@@ -1,2 +1,2 @@
 const short = 1
-const wide = 0
+const wide = "${WIDE_TEXT}"
`

/** Wraps once at unified's 54-cell code width: a 60-column pane less its 5-cell gutter and the cell wrap reserves. */
export const LONG_LINE = `  const message = "${"a fairly long line that keeps going ".repeat(2)}"`
export const ONE_LONG_LINE = `diff --git a/notes.ts b/notes.ts
index 1111111..2222222 100644
--- a/notes.ts
+++ b/notes.ts
@@ -1,3 +1,3 @@
 export function note() {
-  return 1
+${LONG_LINE}
 }
`

/** A file numbered in one digit beside one numbered in three, so each sizes its own gutter. */
export const MIXED_DIGITS = `diff --git a/short.ts b/short.ts
index 1111111..2222222 100644
--- a/short.ts
+++ b/short.ts
@@ -1,2 +1,2 @@
 const a = 1
-const b = 2
+const b = 3
diff --git a/far.ts b/far.ts
index 1111111..2222222 100644
--- a/far.ts
+++ b/far.ts
@@ -120,2 +120,2 @@
 const c = 1
-const d = 2
+const d = 3
`

const WRAPPING_LINE_COUNT = 60
const WRAPPING_TEXT = "a line long enough that a 120-column pane wraps it onto a second row ".repeat(2).trimEnd()
/**
 * Sixty lines numbered from 1 that wrap to twice as many rows at 120
 * columns, so the rows wrap adds, not the numbers, reach three digits.
 */
export const MANY_WRAPPED_LINES = `diff --git a/wrapped.ts b/wrapped.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/wrapped.ts
@@ -0,0 +1,${WRAPPING_LINE_COUNT} @@
${Array.from({ length: WRAPPING_LINE_COUNT }, (_, i) => `+const line${i + 1} = "${WRAPPING_TEXT}"`).join("\n")}
`

/**
 * Ninety-eight lines and the divider after them: 99 rows beside a 5-cell
 * gutter at 30 columns, where each line just fits, and nearly twice that
 * beside a 6-cell one, where each wraps.
 */
export const JUST_FITS_AT_30 = `diff --git a/tight.ts b/tight.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/tight.ts
@@ -0,0 +1,98 @@
${Array.from({ length: 98 }, () => `+${"x".repeat(30 - 5 - 1)}`).join("\n")}
`
