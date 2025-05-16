return {
	{
		"olimorris/codecompanion.nvim",
		event = "VeryLazy",
		opts = {
			adapters = {
				openai = function()
					return require("codecompanion.adapters").extend("openai", {
						env = {
							api_key = "OPENAI_API_KEY",
						},
					})
				end,
			},
		},
		dependencies = {
			"nvim-lua/plenary.nvim",
			"nvim-treesitter/nvim-treesitter",
		},
	},
}
