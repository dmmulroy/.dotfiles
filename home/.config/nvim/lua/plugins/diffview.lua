return {
	{
		"sindrets/diffview.nvim",
		cmd = { "DiffviewOpen", "DiffviewFileHistory", "DiffviewClose" },
		keys = {
			{ "<leader>gd", "<cmd>DiffviewOpen<cr>", desc = "Diff view (working copy)" },
			{ "<leader>gc", "<cmd>DiffviewClose<cr>", desc = "Close diff view" },
			{ "<leader>gh", "<cmd>DiffviewFileHistory %<cr>", desc = "File history (current)" },
			{ "<leader>gH", "<cmd>DiffviewFileHistory<cr>", desc = "File history (repo)" },
		},
		config = function()
			local actions = require("diffview.actions")

			require("diffview").setup({
				enhanced_diff_hl = true,
				show_help_hints = false,
				view = {
					default = { winbar_info = false },
					merge_tool = {
						layout = "diff3_mixed",
						disable_diagnostics = true,
						winbar_info = true,
					},
					file_history = { winbar_info = false },
				},
				file_panel = {
					listing_style = "tree",
					tree_options = {
						flatten_dirs = true,
						folder_statuses = "only_folded",
					},
					win_config = {
						position = "left",
						width = 35,
					},
				},
				keymaps = {
					view = {
						{ "n", "<tab>", actions.select_next_entry, { desc = "Next file" } },
						{ "n", "<s-tab>", actions.select_prev_entry, { desc = "Prev file" } },
						{ "n", "<leader>gf", actions.toggle_files, { desc = "Toggle file panel" } },
						{ "n", "<leader>e", actions.focus_files, { desc = "Focus file panel" } },
						{ "n", "q", actions.close, { desc = "Close diffview" } },
					},
					file_panel = {
						{ "n", "j", actions.next_entry, { desc = "Next entry" } },
						{ "n", "k", actions.prev_entry, { desc = "Prev entry" } },
						{ "n", "<cr>", actions.select_entry, { desc = "Open diff" } },
						{ "n", "s", actions.toggle_stage_entry, { desc = "Stage/unstage" } },
						{ "n", "S", actions.stage_all, { desc = "Stage all" } },
						{ "n", "U", actions.unstage_all, { desc = "Unstage all" } },
						{ "n", "X", actions.restore_entry, { desc = "Restore entry" } },
						{ "n", "R", actions.refresh_files, { desc = "Refresh" } },
						{ "n", "<tab>", actions.select_next_entry, { desc = "Next file" } },
						{ "n", "<s-tab>", actions.select_prev_entry, { desc = "Prev file" } },
						{ "n", "<leader>gf", actions.toggle_files, { desc = "Toggle file panel" } },
						{ "n", "q", actions.close, { desc = "Close diffview" } },
					},
					file_history_panel = {
						{ "n", "j", actions.next_entry, { desc = "Next entry" } },
						{ "n", "k", actions.prev_entry, { desc = "Prev entry" } },
						{ "n", "<cr>", actions.select_entry, { desc = "Open diff" } },
						{ "n", "y", actions.copy_hash, { desc = "Copy commit hash" } },
						{ "n", "q", actions.close, { desc = "Close diffview" } },
					},
				},
			})
		end,
	},
}
