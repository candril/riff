# Open a PR From Nothing

**Status**: Done

**Not built**: reaching the screen from inside a review (P2), `riff repo#123`
as a command-line target (P3), recent PRs under the field (P3)

## Description

`riff` with nothing to review is a dead end: a clean checkout draws "No
changes to display", and outside a repository riff exits with an error. Yet
the usual reason to start it there is a PR link on the clipboard.

So `riff` with nothing to review asks for a PR. Paste a link, or type an id in
whichever form is at hand. In a repository an id is that repository's PR.
Anywhere else riff asks which repository was meant, offering the ones presto
tracks, with the PR of that number in each so the right one can be recognised.

## Out of Scope

- **Finding PRs.** No search and no list of open PRs: that is presto.
- **Hosts other than github.com**, as everywhere else in riff.
- **A second review in one process.** The screen comes before the review.
  Choosing a PR continues as `riff gh:owner/repo#123` would have.

## Capabilities

### P1

- **When it shows.** `riff` with no target, on a terminal, when the working
  copy has no changes or there is no repository to read. `riff --open` (`-o`)
  shows it regardless. A target, `--demo` or a non-terminal stdin or stdout
  never shows it.
- **The forms the field reads.** Surrounding whitespace, quotes and angle
  brackets are ignored.

  | Typed | Means |
  |---|---|
  | `123`, `#123` | That PR in the current repository, or else ask |
  | `repo#123`, `repo/123` | `repo` by name or presto alias, among the known repositories |
  | `owner/repo#123`, `owner/repo/123`, `owner/repo/pull/123`, `gh:owner/repo#123` | That PR |
  | `https://github.com/owner/repo/pull/123/files` and the like | That PR, whatever follows the number |

- **The known repositories** are presto's `[[repositories]]`
  (`~/.config/presto/config.toml`), disabled ones included since they can still
  be opened, then riff's `[storage.repos]` keys. A missing or malformed presto
  config contributes none. The current repository counts when matching a name.
- **Asking which repository.** An id outside a repository, or a name more than
  one known repository answers to, lists the candidates at once and asks. One
  query looks the number up in all of them: a row gains the PR's title, state
  and author, and a repository with no such PR leaves the list. If the lookup
  fails the rows stay, unlabelled. If no repository has the PR, the field comes
  back with that said.
- **A PR that does not exist stays on the screen.** Before leaving, a single
  repository's PR is looked up too; not finding it, or failing to ask, is said
  under the field with the text left in it to correct.
- **Keys.** Field: `Enter` opens, `Esc` leaves. List: `j`/`k`, the arrows or
  `Ctrl-n`/`Ctrl-p` move, `Enter` opens, `Esc` returns to the field. `Esc` while
  a lookup runs abandons it. `Ctrl-c` quits from anywhere.
- **`Esc` from the field** goes to the checkout's ordinary review where there is
  one to read, so `riff` left open waiting for changes still works as it did,
  and quits where there is not. The hint says which.

### P2

- **From inside a review**, a palette action opening the screen, relaunching as
  reviewing the branch's PR does.

### P3

- `riff repo#123` and `riff owner/repo#123` as command-line targets.
- The PRs recently opened in riff, listed under the field.

## Technical Notes

- `src/features/open-pr/reference.ts`: the field's text to a reference, and a
  reference to a repository or the question. Pure.
- `src/features/open-pr/known-repos.ts`: presto's config and `storage.repos` as
  one list.
- `src/features/open-pr/state.ts`: the screen's state factory (ADR-003).
- `src/providers/github/lookups.ts`: `lookupPrs`. One aliased GraphQL query per
  Enter, never on a timer. `gh` exits non-zero when any alias is not found, so
  stdout decides, not the exit code.
- `src/components/open-pr-model.ts`, `OpenPrScreen.tsx`: what the screen shows.
- `src/app/open-pr.tsx`: a renderer of its own, destroyed before `createApp`
  builds the next. `src/index.ts` feeds the choice into the existing PR path, so
  storage resolution and its confirmation prompt are unchanged.
