return {
	{
		"echasnovski/mini.indentscope",
		version = false,
		event = "BufEnter",
		opts = {
			symbol = "│",
			options = { try_as_border = true },
		},
		init = function()
			vim.api.nvim_create_autocmd("FileType", {
				pattern = {
					"help",
					"lazy",
					"mason",
					"notify",
					"oil",
					"Oil",
				},
				callback = function()
					vim.b.miniindentscope_disable = true
				end,
			})

			vim.api.nvim_set_hl(0, "MiniIndentscopeSymbol", { fg = "#c6a0f6" })
		end,
	},
}
