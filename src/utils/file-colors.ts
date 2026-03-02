/**
 * File type color coding for file tree and file picker.
 * Colors based on common editor/IDE conventions.
 */

import { theme } from "../theme"

// Language/file type to color mapping
// Using catppuccin mocha palette colors
const fileColorMap: Record<string, string> = {
  // TypeScript/JavaScript - blue family
  typescript: theme.blue,
  tsx: theme.blue,
  javascript: theme.yellow,
  jsx: theme.yellow,
  
  // Web - pink/mauve
  html: theme.peach,
  css: theme.blue,
  scss: theme.pink,
  
  // Data formats - yellow/peach
  json: theme.yellow,
  yaml: theme.peach,
  toml: theme.peach,
  xml: theme.peach,
  
  // Systems languages - teal/green
  rust: theme.peach,
  go: theme.teal,
  c: theme.blue,
  cpp: theme.blue,
  
  // Scripting - green
  python: theme.green,
  ruby: theme.red,
  bash: theme.green,
  
  // JVM - red/orange
  java: theme.red,
  kotlin: theme.mauve,
  scala: theme.red,
  
  // .NET - mauve
  csharp: theme.mauve,
  
  // Mobile
  swift: theme.peach,
  
  // Docs - lavender
  markdown: theme.lavender,
  
  // Config files
  dockerfile: theme.blue,
  makefile: theme.green,
}

// Extension to filetype mapping (for files that don't match a simple extension)
const extensionMap: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "c",
  hpp: "cpp",
  hxx: "cpp",
  cs: "csharp",
  kt: "kotlin",
  scala: "scala",
  swift: "swift",
  md: "markdown",
  mdx: "markdown",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "css",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
}

// Special filename patterns
const specialFiles: Record<string, string> = {
  "Dockerfile": "dockerfile",
  "Makefile": "makefile",
  "justfile": "makefile",
  "Justfile": "makefile",
  "CMakeLists.txt": "makefile",
  ".gitignore": "bash",
  ".env": "bash",
  ".envrc": "bash",
  "package.json": "json",
  "tsconfig.json": "json",
  "bunfig.toml": "toml",
  "README.md": "markdown",
  "CHANGELOG.md": "markdown",
  "LICENSE": "markdown",
}

/**
 * Get the filetype for a given filename
 */
export function getFiletype(filename: string): string | undefined {
  // Check special files first
  const baseName = filename.split("/").pop() || filename
  if (specialFiles[baseName]) {
    return specialFiles[baseName]
  }
  
  // Check extension
  const ext = baseName.split(".").pop()?.toLowerCase()
  if (ext && extensionMap[ext]) {
    return extensionMap[ext]
  }
  
  return undefined
}

/**
 * Get the color for a file based on its name/extension.
 * Returns undefined to use the default text color.
 */
export function getFileColor(filename: string): string | undefined {
  const filetype = getFiletype(filename)
  if (filetype && fileColorMap[filetype]) {
    return fileColorMap[filetype]
  }
  return undefined
}
