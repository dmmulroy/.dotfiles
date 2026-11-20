-- Vim-aware navigation on ctrl+h/j/k/l

-- Neovim side: smart-splits.nvim with smart-splits-backend-rex
-- (home/.config/nvim/lua/plugins/smart-splits.lua). When Neovim is in the
-- foreground the key falls through to it; at its edge window, the backend asks
-- Rex to focus the neighbouring pane. In other panes Rex moves focus, and at
-- the outer edge the key falls through so shell ctrl+l (clear) still works.
local terminal = "com.superlogical.terminal"
local vim_names = { vi = true, vim = true, nvim = true, view = true, vimdiff = true, nvimdiff = true }

local function foreground_is_vim(ctx)
	local proc = rex.block.call(terminal, "process", { block_id = ctx.block_id })
	local fg = proc and proc.foreground
	if not fg then
		return false
	end
	-- `name` is not always the executable name, so check argv0 too.
	for _, s in ipairs({ fg.name or "", (fg.argv0 or ""):match("[^/]*$") or "" }) do
		if vim_names[s:lower()] then
			return true
		end
	end
	return false
end

for key, direction in pairs({ h = "left", j = "down", k = "up", l = "right" }) do
	rex.bind("ctrl+" .. key, function(ctx)
		if foreground_is_vim(ctx) then
			return false
		end
		local before = rex.session.view({})
		local after = rex.session.focus_direction({ direction = direction })
		-- Focus didn't move (outer edge): let the terminal have the key.
		return before ~= nil and after ~= nil and after.revision ~= before.revision
	end)
end
