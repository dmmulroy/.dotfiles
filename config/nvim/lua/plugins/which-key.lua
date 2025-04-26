return {
	{
		"folke/which-key.nvim",
		event = "VeryLazy",
		opts = {
			delay = 500,
			filter = function(mapping)
				return mapping.desc ~= "Disable space (leader) in normal mode"
			end,
		},
	},
}
