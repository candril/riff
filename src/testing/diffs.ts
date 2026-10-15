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
