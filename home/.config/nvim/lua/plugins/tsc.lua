return {
	{
		"dmmulroy/tsc.nvim",
		lazy = true,
		ft = { "typescript", "typescriptreact" },
		config = function()
			require("tsc").setup({
				bin_path = "/Users/dmmulroy/.bun/bin/tsgo",
				auto_open_qflist = true,
				pretty_errors = false,
				-- bin_path = "~/.bun/bin/tsgo",
				flags = "--noEmit --pretty false", -- This just works
			})
		end,
	},
}
