return {
	{
		name = "hodor.nvim",
		dir = vim.fn.expand("~/Code/personal/hodor"),
		dependencies = {
			"folke/snacks.nvim",
		},
		cmd = {
			"Hodor",
			"HodorBase",
			"HodorSubmit",
			"HodorComment",
			"HodorDeleteComment",
			"HodorToggleView",
			"HodorNextHunk",
			"HodorPrevHunk",
			"HodorNextFile",
			"HodorPrevFile",
			"HodorSubmitComment",
		},
		keys = {
			{ "<leader>gr", "<cmd>Hodor<cr>", desc = "[G]it AI [R]eview" },
		},
		opts = {
			ui = {
				use_snacks_notifier = true,
			},
		},
		config = function(_, opts)
			require("hodor").setup(opts)
		end,
	},
}
