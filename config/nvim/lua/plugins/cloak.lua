return {
	{
		"laytan/cloak.nvim",
		lazy = true,
		config = function()
			require("cloak").setup()
		end,
	},
}
