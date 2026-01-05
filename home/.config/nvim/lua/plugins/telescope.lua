return {
	{
		"nvim-telescope/telescope.nvim",
		branch = "master",
		dependencies = {
			"nvim-lua/plenary.nvim",
			{
				"nvim-telescope/telescope-fzf-native.nvim",
				build = "cmake -S. -Bbuild -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release && cmake --install build --prefix build",
				cond = vim.fn.executable("cmake") == 1,
			},
			{
				"zschreur/telescope-jj.nvim",
			},
		},
		config = function()
			local actions = require("telescope.actions")
			local telescope = require("telescope")

			telescope.setup({
				defaults = {
					mappings = {
						i = {
							["<C-k>"] = actions.move_selection_previous,
							["<C-j>"] = actions.move_selection_next,
							["<C-q>"] = actions.send_selected_to_qflist + actions.open_qflist,
							["<C-x>"] = actions.delete_buffer,
						},
					},
					file_ignore_patterns = {
						"node_modules",
						"yarn.lock",
						".git",
						".sl",
						"_build",
						".next",
					},
					hidden = true,
					path_display = {
						"filename_first",
					},
				},
			})

			-- Enable telescope fzf native, if installed
			pcall(telescope.load_extension, "fzf")
			-- Enable telescope-jj
			pcall(telescope.load_extension, "jj")
		end,
		keys = {
			-- jj-aware file picker with git fallback
			{
				"<leader>sf",
				function()
					-- Try jj first
					local jj_ok = pcall(require("telescope").extensions.jj.files)
					if jj_ok then
						return
					end
					-- Fallback to find_files (works everywhere)
					require("telescope.builtin").find_files({ hidden = true })
				end,
				desc = "Find files (jj/git aware)",
			},
			{
				"<leader>sj",
				function()
					require("telescope").extensions.jj.diff()
				end,
				desc = "jj diff (changed files)",
			},
		},
	},
}
