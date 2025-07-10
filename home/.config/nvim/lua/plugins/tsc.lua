return {
	{
		"dmmulroy/tsc.nvim",
		lazy = true,
		ft = { "typescript", "typescriptreact" },
		config = function()
			require("tsc").setup({
				-- bin_path = "/Users/dmmulroy/.bun/bin/tsgo",
				auto_open_qflist = true,
				pretty_errors = false,
			})
		end,
	},
}
