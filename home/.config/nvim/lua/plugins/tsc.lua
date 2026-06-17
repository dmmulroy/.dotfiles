return {
	{
		"dmmulroy/tsc.nvim",
		lazy = true,
		ft = { "typescript", "typescriptreact" },
		config = function()
			require("tsc").setup({
				auto_open_qflist = true,
				pretty_errors = false,
				flags = {
					noEmit = true,
					pretty = "false",
				},
			})
		end,
	},
}
