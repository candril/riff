/**
 * Additional tree-sitter parsers for syntax highlighting.
 * 
 * OpenTUI bundles parsers for: javascript, typescript, markdown, zig
 * This file adds support for additional languages like tsx, csharp, etc.
 */
import { addDefaultParsers, type FiletypeParserOptions } from "@opentui/core"

// TSX parser - separate from TypeScript because it includes JSX syntax
// Uses tree-sitter repo queries (nvim-treesitter has incompatible #set! predicates)
const tsxParser: FiletypeParserOptions = {
  filetype: "tsx",
  wasm: "https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.23.2/tree-sitter-tsx.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/tree-sitter/tree-sitter-javascript/master/queries/highlights.scm",
      "https://raw.githubusercontent.com/tree-sitter/tree-sitter-typescript/master/queries/highlights.scm",
    ],
  },
}

// JSX parser - JavaScript with JSX syntax
const jsxParser: FiletypeParserOptions = {
  filetype: "jsx",
  wasm: "https://github.com/tree-sitter/tree-sitter-javascript/releases/download/v0.23.1/tree-sitter-javascript.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/tree-sitter/tree-sitter-javascript/master/queries/highlights.scm",
    ],
  },
}

// C# parser
const csharpParser: FiletypeParserOptions = {
  filetype: "csharp",
  wasm: "https://github.com/tree-sitter/tree-sitter-c-sharp/releases/download/v0.23.1/tree-sitter-c_sharp.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/c_sharp/highlights.scm",
    ],
  },
}

// Python parser
const pythonParser: FiletypeParserOptions = {
  filetype: "python",
  wasm: "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.23.6/tree-sitter-python.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/python/highlights.scm",
    ],
  },
}

// Rust parser
const rustParser: FiletypeParserOptions = {
  filetype: "rust",
  wasm: "https://github.com/tree-sitter/tree-sitter-rust/releases/download/v0.24.0/tree-sitter-rust.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/rust/highlights.scm",
    ],
  },
}

// Go parser
const goParser: FiletypeParserOptions = {
  filetype: "go",
  wasm: "https://github.com/tree-sitter/tree-sitter-go/releases/download/v0.25.0/tree-sitter-go.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/go/highlights.scm",
    ],
  },
}

// JSON parser
const jsonParser: FiletypeParserOptions = {
  filetype: "json",
  wasm: "https://github.com/tree-sitter/tree-sitter-json/releases/download/v0.24.8/tree-sitter-json.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/json/highlights.scm",
    ],
  },
}

// YAML parser
const yamlParser: FiletypeParserOptions = {
  filetype: "yaml",
  wasm: "https://github.com/tree-sitter-grammars/tree-sitter-yaml/releases/download/v0.7.2/tree-sitter-yaml.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/yaml/highlights.scm",
    ],
  },
}

// CSS parser
const cssParser: FiletypeParserOptions = {
  filetype: "css",
  wasm: "https://github.com/tree-sitter/tree-sitter-css/releases/download/v0.25.0/tree-sitter-css.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/css/highlights.scm",
    ],
  },
}

// HTML parser
const htmlParser: FiletypeParserOptions = {
  filetype: "html",
  wasm: "https://github.com/tree-sitter/tree-sitter-html/releases/download/v0.23.2/tree-sitter-html.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/html/highlights.scm",
    ],
  },
}

// Bash parser
const bashParser: FiletypeParserOptions = {
  filetype: "bash",
  wasm: "https://github.com/tree-sitter/tree-sitter-bash/releases/download/v0.25.0/tree-sitter-bash.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/bash/highlights.scm",
    ],
  },
}

// Ruby parser
const rubyParser: FiletypeParserOptions = {
  filetype: "ruby",
  wasm: "https://github.com/tree-sitter/tree-sitter-ruby/releases/download/v0.23.1/tree-sitter-ruby.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/ruby/highlights.scm",
    ],
  },
}

// Java parser
const javaParser: FiletypeParserOptions = {
  filetype: "java",
  wasm: "https://github.com/tree-sitter/tree-sitter-java/releases/download/v0.23.5/tree-sitter-java.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/java/highlights.scm",
    ],
  },
}

// C parser
const cParser: FiletypeParserOptions = {
  filetype: "c",
  wasm: "https://github.com/tree-sitter/tree-sitter-c/releases/download/v0.24.1/tree-sitter-c.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/c/highlights.scm",
    ],
  },
}

// C++ parser
const cppParser: FiletypeParserOptions = {
  filetype: "cpp",
  wasm: "https://github.com/tree-sitter/tree-sitter-cpp/releases/download/v0.23.4/tree-sitter-cpp.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/cpp/highlights.scm",
    ],
  },
}

/**
 * Register all additional syntax parsers.
 * This must be called BEFORE creating the CLI renderer.
 */
export function registerSyntaxParsers(): void {
  addDefaultParsers([
    tsxParser,
    jsxParser,
    csharpParser,
    pythonParser,
    rustParser,
    goParser,
    jsonParser,
    yamlParser,
    cssParser,
    htmlParser,
    bashParser,
    rubyParser,
    javaParser,
    cParser,
    cppParser,
  ])
}
