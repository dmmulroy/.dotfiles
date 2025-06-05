return {
	{
		"olimorris/codecompanion.nvim",
		event = "VeryLazy",
		dependencies = {
			"nvim-lua/plenary.nvim",
			"nvim-treesitter/nvim-treesitter",
		},
		opts = {
			adapters = {
				openai = function()
					return require("codecompanion.adapters").extend("openai", {
						env = {
							api_key = function()
								return os.getenv("OPENAI_API_KEY")
							end,
						},
					})
				end,
			},
			strategies = {
				chat = {
					adapter = "openai",
				},
				inline = {
					adapter = "openai",
				},
				cmd = {
					adapter = "openai",
				},
			},
		},
	},
}
