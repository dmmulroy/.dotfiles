-- vim-herdr-navigation — Neovim side
--
-- Seamless <C-h/j/k/l> navigation between Neovim splits and Herdr panes:
-- move between Neovim splits, and at a split edge hand off to Herdr so focus
-- crosses into the neighbouring Herdr pane. Outside Herdr it falls back to
-- tmux (if available) or plain Neovim window navigation.

local function navigate(wincmd, direction)
	local previous_window = vim.api.nvim_get_current_win()
	vim.cmd("wincmd " .. wincmd)
	if vim.api.nvim_get_current_win() ~= previous_window then
		return
	end

	if vim.env.HERDR_PANE_ID and vim.env.HERDR_PANE_ID ~= "" then
		local herdr = vim.env.HERDR_BIN_PATH
		if herdr == nil or herdr == "" then
			herdr = "herdr"
		end
		vim.fn.system({ herdr, "pane", "focus", "--direction", direction, "--current" })
	elseif vim.env.TMUX and vim.env.TMUX ~= "" then
		local tmux_directions = { left = "Left", down = "Down", up = "Up", right = "Right" }
		pcall(vim.cmd, "TmuxNavigate" .. tmux_directions[direction])
	end
end

local function map(lhs, wincmd, direction, description)
	vim.keymap.set("n", lhs, function()
		navigate(wincmd, direction)
	end, { silent = true, noremap = true, desc = description })
end

map("<C-h>", "h", "left", "Navigate left (Vim/Herdr)")
map("<C-j>", "j", "down", "Navigate down (Vim/Herdr)")
map("<C-k>", "k", "up", "Navigate up (Vim/Herdr)")
map("<C-l>", "l", "right", "Navigate right (Vim/Herdr)")
