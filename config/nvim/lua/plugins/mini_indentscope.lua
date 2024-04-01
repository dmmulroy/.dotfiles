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
					"Trouble",
					"trouble",
					"lazy",
					"mason",
					"notify",
				},
				callback = function()
					vim.b.miniindentscope_disable = true
				end,
			})
		end,
	},
}
