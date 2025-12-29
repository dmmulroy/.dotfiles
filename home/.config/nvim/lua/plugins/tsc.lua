return {
	{
		"dmmulroy/tsc.nvim",
		lazy = true,
		ft = { "typescript", "typescriptreact" },
		config = function()
			require("tsc").setup({
				bin_name = "tsgo",
				auto_open_qflist = true,
				pretty_errors = false,
				flags = "--noEmit --pretty false",
			})
		end,
	},
}
