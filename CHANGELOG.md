# Changelog

All notable changes to riff are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the release workflow lifts
the section matching a tag into that release's notes — an unwritten entry ships an empty
release, so write it before tagging.

## [Unreleased]

## [0.1.0] - 2026-09-06

First release.

### Added

- **One diff, four ways to name it** — a PR number, a URL, a git or jj revset, or nothing
  at all for the working copy. Local and PR mode are the same app.
- **A diff that reads like a buffer** — vim motions, hunk and file jumps, folds, a
  jumplist, flash jump, search, and a file tree with its own filter.
- **Comments on the line** — drafts anchored to a line or a range, stored as Markdown in
  `.riff/` next to the code, walked with `]r`/`[r`, published only when you say so.
- **Publish deliberately** — one batched review (`gS`), a sync of edits, replies and
  resolutions (`gs`), or a single comment (`S`).
- **The PR without leaving** — overview with description, conversation, checks with
  annotations, approvals, commits and files; commit-by-commit narrowing; GitHub's own
  viewed state.
- **Claude Code integration** — a plugin and skill that read local comments with
  `riff comments --json` and retire them with `riff comments resolve`.
- Prebuilt binaries for macOS (arm64, x64) and Linux (x64, arm64), a curl installer, a
  Homebrew formula and a Nix package via [candril/homebrew-tap](https://github.com/candril/homebrew-tap).

[Unreleased]: https://github.com/candril/riff/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/candril/riff/releases/tag/v0.1.0
