local M = {}
local root = vim.fs.dirname(vim.fs.dirname(vim.fs.dirname(debug.getinfo(1, "S").source:sub(2))))

function M.check()
  local health = vim.health
  health.start("Markdown Preview source installation")
  health.info("Platform: " .. vim.uv.os_uname().sysname .. " / " .. vim.uv.os_uname().machine)
  health.info("Plugin: " .. root)
  if vim.fn.has("nvim-0.12.2") == 1 then
    health.ok("Neovim " .. tostring(vim.version()))
  else
    health.error("Neovim 0.12.2 or newer is the supported target")
  end

  local node = vim.g.mkdp_node_command or "node"
  if vim.fn.executable(node) ~= 1 then
    health.error("Node.js 24 not found: " .. node .. ". Set g:mkdp_node_command or fix Neovim's PATH.")
  else
    local result = vim.system({ node, "--version" }, { text = true }):wait(5000)
    local version = vim.trim(result.stdout or "")
    if result.code == 0 and version:match("^v24%.") then
      health.ok("Node.js " .. version .. " (" .. node .. ")")
      local dependencies = vim.system({ node, "-e", "for (const id of ['@chemzqm/neovim', 'socket.io', 'log4js']) require.resolve(id)" }, { cwd = root, text = true }):wait(5000)
      if dependencies.code == 0 then
        health.ok("Node runtime dependencies installed")
      else
        health.error("Missing Node runtime dependencies. Run npm ci && npm run build in " .. root)
      end
    else
      health.error("Node.js 24 required; found " .. version .. " (" .. node .. ")")
    end
  end

  local missing = {}
  for _, name in ipairs({ "app/index.js", "app/lib/attach/index.js", "app/out/index.html" }) do
    if vim.fn.filereadable(vim.fs.joinpath(root, name)) ~= 1 then
      table.insert(missing, name)
    end
  end
  if #missing == 0 then
    health.ok("Source build present")
  else
    health.error("Missing build files: " .. table.concat(missing, ", ") .. ". Run npm ci && npm run build in " .. root)
  end
  local hook = vim.g.mkdp_browserfunc or ""
  if hook == "" then
    health.info("Browser: default platform opener; use g:mkdp_browserfunc for a custom launcher")
  elseif vim.fn.exists("*" .. hook) == 1 then
    health.ok("Browser hook: " .. hook)
  else
    health.error("Browser hook does not exist: " .. hook)
  end
  health.info("Build toolchain: Node.js 24 and npm 11. Keep node_modules after building.")
end

return M
