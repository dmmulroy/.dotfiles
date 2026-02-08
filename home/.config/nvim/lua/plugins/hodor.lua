return {
	{
		dir = "~/Code/personal/nvim-ai-code-review/specs/hodor-nvim-opus-4-6",
		name = "hodor.nvim",
		dependencies = { "MunifTanjim/nui.nvim" },
		cmd = { "Hodor", "HodorSubmit", "HodorBase", "HodorComment", "HodorToggleView" },
		keys = {
			{ "<leader>hr", "<cmd>Hodor<cr>", desc = "Hodor: open review" },
			{ "<leader>hs", "<cmd>HodorSubmit<cr>", desc = "Hodor: submit review" },
		},
		config = function()
			require("hodor").setup({
				opencode = {
					host = "127.0.0.1",
					port = 4096,
				},
			})
		end,
	},
}
