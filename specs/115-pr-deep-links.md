# PR Deep Links

**Status**: Done

**Not built**: a line outside the diff's hunks is not revealed by expanding the context around
it — riff opens the file and says the line isn't in the diff. A local review that opens its
branch's PR (spec 079) does not listen for links; only a riff started on a PR does.

## Description

A link to a PR on GitHub almost always points somewhere in it: a review comment someone asked
about, a reply in the conversation, a line of a file. Hammerspoon hands those links to riff,
and riff used to drop the fragment and open the PR at the top, leaving the reader to find the
comment again.

riff now follows the fragment. Launched with such a link, it opens the PR there. A second link
to a PR riff already has open goes to that riff, through `riff goto <url>`, rather than
starting another one.

```
$ riff 'https://github.com/owner/repo/pull/123#discussion_r456'   # opens on the thread
$ riff goto 'https://github.com/owner/repo/pull/123#issuecomment-789'
$ echo $?                                                          # 0: the running riff went there
```

## Out of Scope

- Links to commits (`/commits/<sha>`), checks or the timeline. The path after the PR number is
  ignored; only the fragment says where.
- Finding which riff has a PR open by asking each one. The socket is named after the PR, so a
  client knows where to look without listing anything.
- Starting riff from `riff goto`. It answers whether a riff has the PR; the caller decides what
  to do when none has.
- Anything but the fragments below. The URL comes from outside riff; an unknown fragment is
  named in a toast and nothing else happens.

## Capabilities

### P1 - Must Have

- **Fragment grammar**, exactly the set Hammerspoon validates:
  - `discussion_r<digits>`, `r<digits>` — a review comment by its GitHub id (`Comment.githubId`).
    Opens its thread the way Enter on a thread in the PR overview does; a reply opens the thread
    it is in, the thread panel on the reply.
  - `issuecomment-<digits>` — a conversation comment. It has no line, so it opens in the PR
    overview: conversation section open, cursor on the comment, the comment opened.
  - `pullrequestreview-<digits>` — a review summary, by `databaseId`. The same, on its row.
  - `diff-<64 lowercase hex>`, optionally `L<n>` or `R<n>`, optionally a range `-L<m>`/`-R<m>` —
    a file, by the SHA-256 of its path (the new path of a rename, the old one checked too). `R`
    is the new side, `L` the old; a range lands on its first line.
- **Tolerant URLs.** The canonical `https://github.com/<owner>/<repo>/pull/<n>#<fragment>`, and
  raw GitHub URLs with a path after the number (`/files`, `/changes`) or a query.
- **Nothing found is said, never thrown.** An unknown fragment, a deleted comment or a file not
  in the diff opens the PR as usual with a short toast saying what was not found. The fragment
  shown is cut and stripped of control characters.
- **At startup**, after the first frame, so the line mapping and the views are laid out.
- **`riff goto <url>`.** Connects to the socket for the URL's PR and sends it. Prints nothing
  and exits 0 when delivered; exits 1 with one line on stderr when no riff has the PR open (or
  the argument is no PR link), 2 when the riff listening refuses it. No `gh` call, a one-second
  connect timeout, never the TUI.
- **The socket.** In PR mode riff listens at `<os.tmpdir()>/riff-<uid>/<slug>.sock`, the slug
  the review's `.riff/` directory is named by (`gh:owner/repo#123` → `gh-owner-repo-123`),
  lowercased. The directory is created 0700 and refused if someone else owns it or can enter
  it; the socket is 0600. It is removed when riff exits. A socket file nothing answers on is
  left from a riff that died and is replaced; one that answers belongs to another riff on the
  same PR, which keeps it.
- **Protocol.** One line of JSON, `{"url": "..."}`; one line back, `ok` or `error: <reason>`.
  The URL is parsed with the same parser, and a URL for another PR is refused. A fragment riff
  cannot follow is still `ok`: the running riff shows the toast.

### P2 - Should Have

- **The jumplist.** Each landing pushes where the reader was, so `Ctrl-o` goes back.
- **Case.** Owner and repository compare without regard to case, as GitHub reads them.

## Technical Notes

```
src/features/deep-link/
├── parse.ts     # parsePrLink, parseFragment: the grammar, nothing else acted on
├── resolve.ts   # pathHash → file, GitHub id → review comment at its thread's anchor
├── jump.ts      # followLink: switch view, land, or toast what was not found
├── socket.ts    # socketPath, listenForLinks (Bun.listen unix:), sendLink
└── index.ts     # answerLink (refuses another PR), serveLinks
src/cli/goto.ts  # riff goto
```

- `PRInfoPanelClass.revealConversationItem(matches)` clears the panel's filter, opens the
  conversation section, and stands on the matching row, opened. A comment another section
  speaks for (the deploy bot's preview table, spec 068) is not a row, and is reported not found.
  The row is held at the top of the panel for the first few frames, while the opened body is
  measured; the usual minimal reveal would leave it on the bottom edge with its body off screen.
- macOS caps a socket path at 104 bytes. A slug too long for it is named by the first 24 hex
  digits of its SHA-256 instead; `riff goto` computes the same name.
- The listener answers from its `data` handler, outside the keypress loop, and renders the
  way the comment poll does.
