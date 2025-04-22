vim.api.nvim_create_autocmd("FileType", {
	pattern = "oil",
	callback = function()
		vim.opt_local.colorcolumn = ""
	end,
})

return {
	{
		"stevearc/oil.nvim",
		opts = {},
		-- Optional dependencies
		dependencies = { "nvim-tree/nvim-web-devicons" },
		config = function()
			require("oil").setup({
				-- use_default_keymaps = false,
				keymaps = {
					["<C-_>"] = { "actions.select", opts = { vertical = true } },
				},
				view_options = {
					show_hidden = true,
				},
			})
		end,
	},
}
