return {
	{
		"zbirenbaum/copilot.lua",
		cmd = "Copilot",
		lazy = true,
		event = "InsertEnter",
		config = function()
			require("copilot").setup({
				suggestion = {
					enabled = true,
					auto_trigger = true,
					keymap = {
						accept = "<A-y>",
						next = "<A-k>",
						prev = "<A-j>",
						dismiss = "<A-n>",
					},
				},
			})
		end,
	},
}
