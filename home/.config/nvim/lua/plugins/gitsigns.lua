return {
	{
		"lewis6991/gitsigns.nvim",
		lazy = true,
		event = { "BufEnter" },
		config = function()
			require("gitsigns").setup()
		end,
	},
}
