--- riff.nvim — write riff comments from the editor, see where they are.
---
--- nvim owns navigation, display and the moment a comment is written. riff
--- owns the comment: `riff comments add` decides which `.riff/` a comment
--- belongs in, what the file format is and how a note is anchored, because
--- that answer is six rules deep and a second implementation would write
--- where riff does not read (spec 091).

local M = {}

local config = {
  --- The riff executable. A path, or a name on the PATH.
  cmd = "riff",
  --- Virtual text: how much of the comment to show beside the line.
  preview_width = 40,
  --- Prefix drawn before the preview, so a commented line is findable by eye.
  sign = "▌ ",
  --- Highlight group for the virtual text.
  highlight = "Comment",
  --- Gutter sign on a commented line. At most two display cells — nvim
  --- refuses a wider one.
  gutter = "▌",
  --- Highlight group for the gutter sign.
  gutter_highlight = "Comment",
  --- "preview" spells the comment out beside the line, "dot" marks the line
  --- and says nothing. See `M.toggle`.
  display = "preview",
  --- The whole of the virtual text in "dot" display.
  dot = "●",
  --- Set to false to keep your own mappings only.
  default_mappings = true,
  --- How long riff's answer is reused for, in milliseconds. Opening a
  --- directory is one burst of buffer reads; this makes it one subprocess.
  cache_ms = 2000,
  --- The gutter sign and highlight for a pull request's own comments, so
  --- what someone else said is not dressed as your own note.
  pr_gutter = "▐",
  pr_highlight = "DiagnosticInfo",
}

local namespace = vim.api.nvim_create_namespace("riff-comments")
--- The pull request's comments are their own layer, shown and hidden as a
--- whole, so clearing them never touches your notes (spec 092).
local pr_namespace = vim.api.nvim_create_namespace("riff-pr-comments")

--- The review riff last fetched, per buffer: `{ [lnum] = { … } }`.
local pr_marks = {}

--- Comments riff knows about, per file, as `{ [lnum] = { body, id } }`.
local marks = {}

--- JSON `null` decodes to `vim.NIL`, which is userdata and therefore
--- truthy — every `x and y or z` over a decoded field needs this first.
local function value(v)
  if v == nil or v == vim.NIL then
    return nil
  end
  return v
end

local function notify(message, level)
  vim.notify("riff: " .. message, level or vim.log.levels.INFO)
end

--- The path riff should anchor to. riff relativises against the repo root
--- itself; an absolute path is the unambiguous thing to hand it.
local function buffer_path(buf)
  local name = vim.api.nvim_buf_get_name(buf or 0)
  return name ~= "" and name or nil
end

--- Run riff and hand back stdout, or nil and the message it failed with.
--- Blocking: only for the write, where the user pressed a key and is
--- waiting for the answer anyway.
local function run(args, stdin)
  local command = vim.list_extend({ config.cmd }, args)
  local out = vim.system(command, { stdin = stdin, text = true }):wait()
  if out.code ~= 0 then
    return nil, (out.stderr ~= "" and out.stderr or out.stdout or "exited " .. out.code)
  end
  return out.stdout
end

--- Everything on one line, short enough to sit beside code.
local function preview(body)
  local first = body:gsub("%s+", " "):gsub("^%s+", "")
  if #first <= config.preview_width then
    return first
  end
  return first:sub(1, config.preview_width - 1) .. "…"
end

local function virtual_text(comments)
  if config.display == "dot" then
    return config.dot
  end
  -- Whose remark it is, when it is not yours. A note has no author to name.
  local who = value(comments[1].author) and (comments[1].author .. ": ") or ""
  local more = #comments > 1 and (" +" .. (#comments - 1)) or ""
  return config.sign .. who .. preview(comments[1].body) .. more
end

--- Draw a mark on every commented line of the buffer.
local function draw_layer(buf, ns, per_line, gutter, highlight)
  vim.api.nvim_buf_clear_namespace(buf, ns, 0, -1)
  local lines = vim.api.nvim_buf_line_count(buf)
  for lnum, comments in pairs(per_line or {}) do
    if lnum <= lines then
      vim.api.nvim_buf_set_extmark(buf, ns, lnum - 1, 0, {
        virt_text = { { virtual_text(comments), highlight } },
        virt_text_pos = "eol",
        hl_mode = "combine",
        sign_text = gutter,
        sign_hl_group = highlight,
      })
    end
  end
end

local function draw(buf)
  draw_layer(buf, namespace, marks[buf], config.gutter, config.gutter_highlight)
end

local function draw_pr(buf)
  draw_layer(buf, pr_namespace, pr_marks[buf], config.pr_gutter, config.pr_highlight)
end

--- What riff last said, and when. Opening a directory of files is one burst
--- of BufReadPost, and each would otherwise be its own `riff comments`.
local report_cache = { at = 0, report = nil }

local function apply(report, buf)
  if not vim.api.nvim_buf_is_valid(buf) then
    return
  end
  local path = buffer_path(buf)
  if not path then
    return
  end

  local root = report.root and (report.root .. "/") or ""
  local found = {}
  for _, thread in ipairs(report.threads) do
    if not thread.resolved and root .. thread.file == path then
      found[thread.line] = found[thread.line] or {}
      table.insert(found[thread.line], {
        body = thread.body,
        id = thread.id,
        replies = value(thread.replies) or {},
      })
    end
  end

  marks[buf] = found
  draw(buf)
end

--- Ask riff what it has, then draw it on this buffer.
---
--- Asked for rather than watched: a comment appears when it is written, when
--- a file is opened, or on request, and none of those is often enough to be
--- worth a daemon. Never blocking — this runs on every `BufReadPost`, and an
--- editor that stops for a subprocess when you open a file is worse than no
--- marks at all.
function M.refresh(buf, opts)
  -- `0` means the current buffer to the API and is truthy to Lua, so
  -- `buf or current` would key everything under 0 and never find it again.
  buf = (buf == nil or buf == 0) and vim.api.nvim_get_current_buf() or buf
  if not buffer_path(buf) then
    return
  end

  local fresh = (vim.uv.now() - report_cache.at) < config.cache_ms
  if fresh and report_cache.report and not (opts and opts.force) then
    apply(report_cache.report, buf)
    return
  end

  vim.system({ config.cmd, "comments", "--json" }, { text = true }, function(out)
    if out.code ~= 0 then
      return
    end
    local ok, report = pcall(vim.json.decode, out.stdout)
    if not ok or type(report) ~= "table" or type(report.threads) ~= "table" then
      return
    end
    report_cache = { at = vim.uv.now(), report = report }
    vim.schedule(function()
      apply(report, buf)
    end)
  end)
end

--- Swap between spelling the comment out beside the line and marking the
--- line and saying nothing. The preview is what you want while reviewing and
--- in the way while writing code, and which of the two you are doing changes
--- several times an hour.
function M.toggle()
  config.display = config.display == "dot" and "preview" or "dot"
  for buf in pairs(marks) do
    if vim.api.nvim_buf_is_valid(buf) and vim.api.nvim_buf_is_loaded(buf) then
      draw(buf)
    else
      marks[buf] = nil
    end
  end
  notify(config.display == "dot" and "comments marked only" or "comments previewed")
end

local function float_width()
  return math.min(72, math.floor(vim.o.columns * 0.8))
end

--- The comments on the line the cursor is on. `nil` when it carries none.
local function comments_at(buf, lnum)
  local found = (marks[buf] or {})[lnum]
  if found and #found > 0 then
    return found
  end
  return nil
end

--- The composer: a scratch buffer in a float, written with `:w`, abandoned
--- with `q`. A real buffer rather than `vim.ui.input` because a review
--- comment is a paragraph more often than it is a sentence, and everything
--- you know about editing one should still work.
local composed = 0

--- `initial` prefills the buffer — an edit starts from what is already
--- written, and a new comment from nothing.
local function compose(title, context, initial, on_submit)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.bo[buf].filetype = "markdown"
  vim.bo[buf].bufhidden = "wipe"
  -- `acwrite`, not the `nofile` a scratch buffer starts as: `:w` refuses a
  -- `nofile` buffer outright (E382) and BufWriteCmd never runs. The name is
  -- what `:w` targets, so it has to be one nothing else holds.
  vim.bo[buf].buftype = "acwrite"
  composed = composed + 1
  vim.api.nvim_buf_set_name(buf, "riff://comment/" .. composed)

  -- Virtual lines rather than text in the buffer: what was already said is
  -- there to be read, and `:w` sends only what the writer typed.
  local context_height = 0
  if context and #context > 0 then
    context_height = math.min(#context, 10)
    local virt_lines = {}
    for index = 1, context_height do
      table.insert(virt_lines, { { context[index], config.highlight } })
    end
    if context_height < #context then
      table.insert(virt_lines, { { "  …", config.highlight } })
      context_height = context_height + 1
    end
    table.insert(virt_lines, { { "", config.highlight } })
    context_height = context_height + 1
    vim.api.nvim_buf_set_extmark(buf, namespace, 0, 0, {
      virt_lines = virt_lines,
      virt_lines_above = true,
    })
  end

  local win = vim.api.nvim_open_win(buf, true, {
    relative = "cursor",
    row = 1,
    col = 0,
    width = float_width(),
    height = 8 + context_height,
    border = "rounded",
    title = " " .. title .. " ",
    title_pos = "left",
    footer = " Ctrl-s to save · Esc to abandon ",
    footer_pos = "right",
  })
  -- The float is for what is in it. The number column, the sign column and
  -- the cursor line belong to the buffer underneath.
  vim.wo[win].wrap = true
  vim.wo[win].linebreak = true
  vim.wo[win].number = false
  vim.wo[win].relativenumber = false
  vim.wo[win].signcolumn = "no"
  vim.wo[win].cursorline = false
  vim.wo[win].foldcolumn = "0"

  if initial and initial ~= "" then
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, vim.split(initial, "\n", { plain = true }))
    vim.api.nvim_win_set_cursor(win, { vim.api.nvim_buf_line_count(buf), 0 })
    -- Opened on what is already written, ready to change it.
    vim.cmd.startinsert({ bang = true })
  else
    vim.cmd.startinsert()
  end

  local function close()
    if vim.api.nvim_win_is_valid(win) then
      vim.api.nvim_win_close(win, true)
    end
  end

  vim.keymap.set("n", "q", close, { buffer = buf, nowait = true })
  -- The composer opens in insert, so `<Esc><Esc>` from there is one `<Esc>`
  -- once the mode is normal — where a dialog is expected to close.
  vim.keymap.set("n", "<Esc>", close, { buffer = buf, nowait = true })

  local function submit()
    local body = table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "\n")
    -- `:x`, `:wq` and `ZZ` write and then quit. Closing the window here
    -- would leave that quit to land on the window that came next — the file
    -- you were reading. Marking the buffer saved lets their own quit close
    -- the float; the deferred close covers a bare `:w`, and finds the
    -- window already gone when both ran.
    vim.bo[buf].modified = false
    vim.schedule(close)
    on_submit(body)
  end

  vim.api.nvim_create_autocmd("BufWriteCmd", { buffer = buf, callback = submit })

  -- Leaving insert to type `:w` is ceremony around one decision. `Ctrl-s` is
  -- what riff's own composer takes, from either mode.
  vim.keymap.set({ "n", "i" }, "<C-s>", function()
    vim.cmd.stopinsert()
    submit()
  end, { buffer = buf, nowait = true })

  return win, buf
end

--- Everything already said on the lines this comment covers.
--- What is already said on a line, for the composer to show above the input.
--- Replies are indented under the comment they answer, so a thread reads as
--- a thread rather than as a pile of remarks.
local function render(comments)
  local lines = {}
  for index, comment in ipairs(comments) do
    if index > 1 then
      table.insert(lines, "")
    end
    local who = comment.author and (comment.author .. ": ") or ""
    for offset, line in ipairs(vim.split(comment.body, "\n", { plain = true })) do
      table.insert(lines, (offset == 1 and who or "") .. line)
    end
    for _, reply in ipairs(comment.replies or {}) do
      local answered = value(reply.author) and (reply.author .. ": ") or ""
      for offset, line in ipairs(vim.split(reply.body, "\n", { plain = true })) do
        table.insert(lines, (offset == 1 and "  ↳ " .. answered or "    ") .. line)
      end
    end
  end
  return lines
end

local function context_for(buf, first, last)
  local lines = {}
  for lnum = first, last do
    local comments = comments_at(buf, lnum)
    if comments then
      if #lines > 0 then
        table.insert(lines, "")
      end
      vim.list_extend(lines, render(comments))
    end
  end
  return lines
end

--- Write a comment on the current line, or on the lines a visual selection
--- covers.
--- Every comment in the repository, in a picker, jumping to the line.
---
--- A mark in the gutter only tells you about the file you already have
--- open. This is the other question: where are they at all.
function M.list()
  vim.system({ config.cmd, "comments", "--json" }, { text = true }, function(out)
    vim.schedule(function()
      local ok, report = pcall(vim.json.decode, out.stdout ~= "" and out.stdout or "{}")
      if out.code ~= 0 or not ok or type(report.threads) ~= "table" then
        notify(vim.trim(out.stderr or "") ~= "" and vim.trim(out.stderr) or "could not read the comments",
          vim.log.levels.WARN)
        return
      end

      local root = report.root and (report.root .. "/") or ""
      local items = {}
      for _, thread in ipairs(report.threads) do
        if not thread.resolved then
          -- Where the line is now, when riff could find it (spec 086).
          local anchor = value(thread.anchor)
          local at = anchor and value(anchor.line) or thread.line
          local who = value(thread.author) and (thread.author .. ": ") or ""
          items[#items + 1] = {
            -- The picker searches `text`, so the path belongs in it. The
            -- quickfix list draws the location itself and takes `body`.
            text = thread.file .. ":" .. at .. "  " .. who .. preview(thread.body),
            body = who .. preview(thread.body),
            file = root .. thread.file,
            pos = { at, 0 },
          }
        end
      end

      if #items == 0 then
        notify("no open comments in this repository")
        return
      end

      local snacks = package.loaded["snacks"]
      if snacks and snacks.picker then
        snacks.picker.pick({ source = "riff", title = "riff comments", items = items, format = "text" })
        return
      end

      -- Without a picker the quickfix list is the thing every nvim has, and
      -- it jumps just the same.
      vim.fn.setqflist({}, " ", {
        title = "riff comments",
        items = vim.tbl_map(function(item)
          return { filename = item.file, lnum = item.pos[1], col = 1, text = item.body }
        end, items),
      })
      vim.cmd("copen")
    end)
  end)
end

--- Mark a comment on this line done.
---
--- riff keeps the note and marks the thread resolved rather than deleting
--- it — a resolved local thread is never published, and the record of what
--- was asked for survives. `riff comments remove` is the one that deletes.
function M.resolve()
  local buf = vim.api.nvim_get_current_buf()
  local lnum = vim.api.nvim_win_get_cursor(0)[1]
  local here = comments_at(buf, lnum)
  if not here then
    notify("no comment on this line")
    return
  end

  local function retire(comment)
    local out, err = run({ "comments", "resolve", comment.id })
    if not out then
      notify(err or "could not resolve the comment", vim.log.levels.ERROR)
      return
    end
    notify("resolved " .. comment.id)
    M.refresh(buf, { force = true })
  end

  if #here == 1 then
    retire(here[1])
    return
  end

  vim.ui.select(here, {
    prompt = "Resolve which comment?",
    format_item = function(comment)
      return preview(comment.body)
    end,
  }, function(chosen)
    if chosen then
      retire(chosen)
    end
  end)
end

--- Show the pull request's comments on this file, fetching them first.
---
--- Asked for, never polled: nvim makes no network calls of its own and does
--- not make them behind your back. This is riff fetching, on a keypress
--- (spec 092).
function M.pr()
  local buf = vim.api.nvim_get_current_buf()
  local path = buffer_path(buf)
  if not path then
    notify("this buffer is not a file", vim.log.levels.WARN)
    return
  end

  notify("fetching the review…")
  vim.system({ config.cmd, "comments", "fetch", "--json" }, { text = true }, function(out)
    vim.schedule(function()
      local ok, report = pcall(vim.json.decode, out.stdout ~= "" and out.stdout or "{}")
      if out.code ~= 0 or not ok or type(report.threads) ~= "table" then
        -- riff refuses on stderr, as JSON when asked for JSON. What it says
        -- is which branch or bookmark it looked under, which is the whole of
        -- what you need when there is no pull request for it.
        local said = ok and type(report) == "table" and report.error or nil
        if not said then
          local fine, refusal = pcall(vim.json.decode, vim.trim(out.stderr or ""))
          said = fine and type(refusal) == "table" and refusal.error or nil
        end
        notify(said or vim.trim(out.stderr or "") or "could not fetch the review", vim.log.levels.WARN)
        return
      end

      local root = report.root and (report.root .. "/") or ""
      local found, gone = {}, 0
      for _, thread in ipairs(report.threads) do
        if thread.kind == "review" and not thread.resolved and root .. thread.file == path then
          -- A review comment's line is a line of the pull request's diff,
          -- not of this worktree. riff says where that line is now; a line
          -- that is gone has nowhere honest to be drawn.
          local anchor = value(thread.anchor)
          local at = anchor and value(anchor.line) or thread.line
          if anchor and anchor.state == "lost" then
            gone = gone + 1
          else
            found[at] = found[at] or {}
            table.insert(found[at], {
              body = thread.body,
              id = thread.id,
              author = value(thread.author),
              replies = value(thread.replies) or {},
            })
          end
        end
      end

      pr_marks[buf] = found
      draw_pr(buf)

      local shown = vim.tbl_count(found)
      if shown == 0 and gone == 0 then
        notify("no open review comments on this file")
      elseif gone > 0 then
        notify(shown .. " shown; " .. gone .. " on code that has since changed")
      else
        notify(shown .. (shown == 1 and " line" or " lines") .. " with review comments")
      end
    end)
  end)
end

--- Put the review away again.
function M.pr_hide()
  local buf = vim.api.nvim_get_current_buf()
  pr_marks[buf] = nil
  vim.api.nvim_buf_clear_namespace(buf, pr_namespace, 0, -1)
end

--- Reopen a comment on what it already says.
local function rewrite(buf, path, lnum, comment)
  compose("Edit comment on " .. vim.fn.fnamemodify(path, ":t") .. ":" .. lnum, nil, comment.body,
    function(body)
      if body:match("^%s*$") then
        notify("nothing written, nothing changed")
        return
      end

      local out, err = run({ "comments", "edit", comment.id }, body)
      if not out then
        notify(err or "could not edit the comment", vim.log.levels.ERROR)
        return
      end

      notify("edited " .. comment.id)
      M.refresh(buf, { force = true })
    end)
end

--- Say something about this line, or change what was already said.
---
--- One key rather than three. A comment already here is what you almost
--- always mean when you press it on a line that has one — reading it, and
--- changing it, are the same window.
function M.comment(range)
  local buf = vim.api.nvim_get_current_buf()
  local path = buffer_path(buf)
  if not path then
    notify("this buffer is not a file", vim.log.levels.WARN)
    return
  end

  local first, last
  if range then
    first, last = range[1], range[2]
  else
    first = vim.api.nvim_win_get_cursor(0)[1]
    last = first
  end

  local here = not range and comments_at(buf, first) or nil
  if here and #here == 1 then
    rewrite(buf, path, first, here[1])
    return
  end
  if here and #here > 1 then
    vim.ui.select(here, {
      prompt = "Which comment?",
      format_item = function(comment)
        return preview(comment.body)
      end,
    }, function(chosen)
      if chosen then
        rewrite(buf, path, first, chosen)
      end
    end)
    return
  end

  local where = vim.fn.fnamemodify(path, ":t") .. ":" .. first .. (last > first and "-" .. last or "")
  compose("Comment on " .. where, context_for(buf, first, last), nil, function(body)
    if body:match("^%s*$") then
      notify("nothing written, nothing saved")
      return
    end

    local args = { "comments", "add", "--file", path, "--line", tostring(last) }
    if last > first then
      vim.list_extend(args, { "--end-line", tostring(first) })
    end

    local out, err = run(args, body)
    if not out then
      notify(err or "could not write the comment", vim.log.levels.ERROR)
      return
    end

    notify("noted " .. vim.trim(out))
    M.refresh(buf, { force = true })
  end)
end

function M.setup(opts)
  config = vim.tbl_extend("force", config, opts or {})

  if config.display ~= "preview" and config.display ~= "dot" then
    config.display = "preview"
  end
  if vim.fn.strdisplaywidth(config.gutter) > 2 then
    config.gutter = vim.fn.strcharpart(config.gutter, 0, 1)
  end

  vim.api.nvim_create_user_command("RiffComment", function(args)
    M.comment(args.range > 0 and { args.line1, args.line2 } or nil)
  end, { range = true, desc = "Comment on this line, or change the comment already here" })

  vim.api.nvim_create_user_command("RiffRefresh", function()
    M.refresh(nil, { force = true })
  end, { desc = "Redraw the riff comments in this buffer" })

  vim.api.nvim_create_user_command("RiffList", function()
    M.list()
  end, { desc = "Every open riff comment in this repository" })

  vim.api.nvim_create_user_command("RiffResolve", function()
    M.resolve()
  end, { desc = "Mark the comment on this line done" })

  vim.api.nvim_create_user_command("RiffPr", function()
    M.pr()
  end, { desc = "Fetch and show the pull request's comments on this file" })

  vim.api.nvim_create_user_command("RiffPrHide", function()
    M.pr_hide()
  end, { desc = "Hide the pull request's comments" })

  vim.api.nvim_create_user_command("RiffToggle", function()
    M.toggle()
  end, { desc = "Switch between previewing the comments and marking the lines" })

  if config.default_mappings then
    vim.keymap.set("n", "<leader>rc", "<cmd>RiffComment<cr>", { desc = "riff: comment on this line" })
    vim.keymap.set("x", "<leader>rc", ":RiffComment<cr>", { desc = "riff: comment on this selection" })
    vim.keymap.set("n", "<leader>rt", "<cmd>RiffToggle<cr>", { desc = "riff: preview the comments, or not" })
    vim.keymap.set("n", "<leader>rl", "<cmd>RiffList<cr>", { desc = "riff: every comment in this repo" })
    vim.keymap.set("n", "<leader>rx", "<cmd>RiffResolve<cr>", { desc = "riff: mark this comment done" })
    vim.keymap.set("n", "<leader>rp", "<cmd>RiffPr<cr>", { desc = "riff: show the review on this file" })
    vim.keymap.set("n", "<leader>rP", "<cmd>RiffPrHide<cr>", { desc = "riff: hide the review" })
  end

  vim.api.nvim_create_autocmd({ "BufReadPost", "BufWritePost" }, {
    pattern = "*",
    callback = function(event)
      M.refresh(event.buf)
    end,
  })
end

return M
