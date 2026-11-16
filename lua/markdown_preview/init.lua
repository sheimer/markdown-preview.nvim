local M = {}
local opening = {}
local waiting = {}
local timer_running = false

local function supported(buf)
  return vim.api.nvim_buf_is_valid(buf) and vim.api.nvim_buf_is_loaded(buf) and vim.tbl_contains(vim.g.mkdp_filetypes or { "markdown" }, vim.bo[buf].filetype)
end

local function connected(buf) return vim.fn["mkdp#rpc#get_server_status"]() == 1 and vim.g.mkdp_preview_ready == 1 and vim.tbl_contains(vim.g.mkdp_preview_buffers or {}, buf) end

local function notify(method, buf)
  local channel = vim.g.mkdp_node_channel_id
  if vim.fn["mkdp#rpc#get_server_status"]() == 1 and channel and vim.g.mkdp_preview_ready == 1 then
    return pcall(vim.rpcnotify, channel, method, { bufnr = buf })
  end
  return false
end

function M.close(buf)
  buf = buf or vim.api.nvim_get_current_buf()
  waiting[buf], opening[buf] = nil, nil
  if vim.api.nvim_buf_is_valid(buf) then
    vim.b[buf].mkdp_preview_requested = 0
    vim.b[buf].mkdp_preview_pending = 0
  end
  notify("close_page", buf)
end

local function flush()
  timer_running = false
  local now = vim.uv.hrtime()
  for buf, deadline in pairs(waiting) do
    if not supported(buf) then
      M.close(buf)
    elseif notify("open_browser", buf) then
      waiting[buf] = nil
    elseif now >= deadline then
      M.close(buf)
      vim.notify("Markdown Preview did not become ready. Check :messages and run npm ci && npm run build in the plugin directory.", vim.log.levels.ERROR)
    end
  end
  if next(waiting) then
    timer_running = true
    vim.defer_fn(flush, 25)
  end
end

function M.open(buf)
  buf = buf or vim.api.nvim_get_current_buf()
  if not supported(buf) then
    return
  end
  if connected(buf) then
    notify("refresh_content", buf)
    return
  end
  if vim.b[buf].mkdp_preview_pending == 1 then
    return
  end

  if vim.fn["mkdp#rpc#get_server_status"]() ~= 1 then
    vim.g.mkdp_preview_ready = 0
    vim.g.mkdp_preview_buffers = {}
    vim.fn["mkdp#rpc#start_server"]()
  end
  local deadline = vim.uv.hrtime() + 10e9
  opening[buf] = deadline
  waiting[buf] = deadline
  vim.b[buf].mkdp_preview_requested = 1
  vim.b[buf].mkdp_preview_pending = 1
  if not timer_running then
    flush()
  end
  -- A failed browser launch must not leave the toggle permanently in "opening".
  vim.defer_fn(function()
    if opening[buf] == deadline then
      opening[buf] = nil
      if vim.api.nvim_buf_is_valid(buf) then
        vim.b[buf].mkdp_preview_pending = 0
      end
    end
  end, 10000)
end

function M.toggle(buf)
  buf = buf or vim.api.nvim_get_current_buf()
  if connected(buf) or (vim.api.nvim_buf_is_valid(buf) and vim.b[buf].mkdp_preview_pending == 1) then
    M.close(buf)
  else
    M.open(buf)
  end
end

-- Called by the preview server with data arguments, never an Ex command.
-- The browser opens the returned buffer URL itself, preserving native link actions.
function M.resolve_link(source, filename)
  local function fail(message) return { error = message } end
  if type(source) ~= "number" or not supported(source) or vim.b[source].mkdp_preview_requested ~= 1 then
    return fail("The source preview is no longer available. Open it again from Neovim.")
  end
  if type(filename) ~= "string" or filename:find("[%z\r\n]") or filename:find("^[\\/]") or filename:find("^[%a][%w+.-]*:") then
    return fail("Only relative Markdown document links are supported.")
  end
  local extension = filename:lower():match("%.([^.]+)$")
  if extension ~= "md" and extension ~= "markdown" then
    return fail("Only Markdown document links are supported.")
  end
  local name = vim.api.nvim_buf_get_name(source)
  if name == "" then
    return fail("Save the source document before following relative links.")
  end
  local target = vim.fs.normalize(vim.fs.joinpath(vim.fs.dirname(name), filename))
  local buf = -1
  for _, candidate in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_get_name(candidate) == target then
      buf = candidate
      break
    end
  end
  -- Prefer an existing buffer, including unsaved edits, over reading from disk.
  if buf == -1 or not vim.api.nvim_buf_is_loaded(buf) then
    if vim.fn.filereadable(target) ~= 1 then
      return fail("Markdown document not found: " .. target)
    end
    buf = vim.fn.bufadd(target)
    local ok = pcall(vim.fn.bufload, buf)
    if not ok or not vim.api.nvim_buf_is_loaded(buf) then
      return fail("Could not load Markdown document: " .. target)
    end
  end
  vim.bo[buf].buflisted = true
  if vim.bo[buf].filetype == "" then
    vim.bo[buf].filetype = "markdown"
  end
  vim.b[buf].mkdp_preview_requested = 1
  return { bufnr = buf }
end

function M.setup()
  vim.g.mkdp_auto_close = 0
  vim.g.mkdp_combine_preview = 0

  local group = vim.api.nvim_create_augroup("MarkdownPreviewBuffers", { clear = true })
  local function attach(buf)
    if not supported(buf) then
      return
    end
    -- Also attach buffers that were loaded before the plugin.
    vim.api.nvim_buf_create_user_command(buf, "MarkdownPreview", function() M.open(buf) end, { desc = "Open this buffer's preview", force = true })
    vim.api.nvim_buf_create_user_command(buf, "MarkdownPreviewStop", function() M.close(buf) end, { desc = "Close this buffer's preview", force = true })
    vim.api.nvim_buf_create_user_command(buf, "MarkdownPreviewToggle", function() M.toggle(buf) end, { desc = "Toggle this buffer's preview", force = true })
  end
  vim.api.nvim_create_autocmd({ "FileType", "BufEnter" }, {
    group = group,
    callback = function(args)
      attach(args.buf)
      if supported(args.buf) and connected(args.buf) then
        notify("refresh_content", args.buf)
      elseif supported(args.buf) and vim.g.mkdp_auto_start == 1 then
        M.open(args.buf)
      end
    end,
  })
  vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI", "TextChanged", "TextChangedI", "BufWritePost", "WinScrolled" }, {
    group = group,
    callback = function(args)
      if supported(args.buf) and connected(args.buf) then
        notify("refresh_content", args.buf)
      end
    end,
  })
  vim.api.nvim_create_autocmd({ "BufUnload", "BufDelete", "BufWipeout" }, {
    group = group,
    callback = function(args)
      if connected(args.buf) or opening[args.buf] or vim.b[args.buf].mkdp_preview_requested == 1 then
        M.close(args.buf)
      end
    end,
  })
  vim.api.nvim_create_autocmd("VimLeavePre", {
    group = group,
    callback = function() vim.fn["mkdp#rpc#stop_server"]() end,
  })
  for _, buf in ipairs(vim.api.nvim_list_bufs()) do
    attach(buf)
  end
end

return M
