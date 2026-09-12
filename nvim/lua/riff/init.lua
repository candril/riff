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
}

local namespace = vim.api.nvim_create_namespace("riff-comments")

--- Comments riff knows about, per file, as `{ [lnum] = { body, id } }`.
local marks = {}

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
  local more = #comments > 1 and (" +" .. (#comments - 1)) or ""
  return config.sign .. preview(comments[1].body) .. more
end

--- Draw a mark on every commented line of the buffer.
local function draw(buf)
  vim.api.nvim_buf_clear_namespace(buf, namespace, 0, -1)
  local lines = vim.api.nvim_buf_line_count(buf)
  for lnum, comments in pairs(marks[buf] or {}) do
    if lnum <= lines then
      vim.api.nvim_buf_set_extmark(buf, namespace, lnum - 1, 0, {
        virt_text = { { virtual_text(comments), config.highlight } },
        virt_text_pos = "eol",
        hl_mode = "combine",
        sign_text = config.gutter,
        sign_hl_group = config.gutter_highlight,
      })
    end
  end
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
        replies = thread.replies or {},
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
  buf = buf or vim.api.nvim_get_current_buf()
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

  vim.api.nvim_create_user_command("RiffToggle", function()
    M.toggle()
  end, { desc = "Switch between previewing the comments and marking the lines" })

  if config.default_mappings then
    vim.keymap.set("n", "<leader>rc", "<cmd>RiffComment<cr>", { desc = "riff: comment on this line" })
    vim.keymap.set("x", "<leader>rc", ":RiffComment<cr>", { desc = "riff: comment on this selection" })
    vim.keymap.set("n", "<leader>rt", "<cmd>RiffToggle<cr>", { desc = "riff: preview the comments, or not" })
  end

  vim.api.nvim_create_autocmd({ "BufReadPost", "BufWritePost" }, {
    pattern = "*",
    callback = function(event)
      M.refresh(event.buf)
    end,
  })
end

return M
