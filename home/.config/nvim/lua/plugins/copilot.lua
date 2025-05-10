return {
	{
		"zbirenbaum/copilot.lua",
		cmd = "Copilot",
		lazy = true,
		event = "InsertEnter",
		config = function()
			require("copilot").setup({})
		end,
	},
}
