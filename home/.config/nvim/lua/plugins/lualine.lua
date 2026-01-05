return {
	{
		"nvim-lualine/lualine.nvim",
		event = "VeryLazy",
		config = function()
			local harpoon = require("harpoon.mark")

			local function truncate_branch_name(branch)
				if not branch or branch == "" then
					return ""
				end

				-- Match the branch name to the specified format
				local user, team, ticket_number = string.match(branch, "^(%w+)/(%w+)%-(%d+)")

				-- If the branch name matches the format, display {user}/{team}-{ticket_number}, otherwise display the full branch name
				if ticket_number then
					return user .. "/" .. team .. "-" .. ticket_number
				else
					return branch
				end
			end

			local vcs_cache = { result = nil, cwd = nil }

			local function get_vcs_info()
				local cwd = vim.fn.getcwd()
				if vcs_cache.cwd == cwd and vcs_cache.result then
					return vcs_cache.result
				end

				-- Check jj first (priority over git for colocated repos)
				vim.fn.system("jj root 2>/dev/null")
				if vim.v.shell_error == 0 then
					local bookmark = vim.fn.system("jj log -r @ --no-graph -T 'bookmarks'"):gsub("%s+$", "")
					if bookmark == "" then
						local change_id =
							vim.fn.system("jj log -r @ --no-graph -T 'change_id.shortest(8)'"):gsub("%s+$", "")
						vcs_cache = { result = change_id, cwd = cwd }
					else
						local first = bookmark:match("^(%S+)") or bookmark
						vcs_cache = { result = truncate_branch_name(first), cwd = cwd }
					end
					return vcs_cache.result
				end

				-- Fallback: git branch
				local branch = vim.fn.system("git branch --show-current 2>/dev/null"):gsub("%s+$", "")
				if vim.v.shell_error == 0 and branch ~= "" then
					vcs_cache = { result = truncate_branch_name(branch), cwd = cwd }
					return vcs_cache.result
				end

				vcs_cache = { result = "", cwd = cwd }
				return ""
			end

			vim.api.nvim_create_autocmd({ "DirChanged", "BufEnter", "FocusGained" }, {
				callback = function()
					vcs_cache = { result = nil, cwd = nil }
				end,
			})

			local function harpoon_component()
				local total_marks = harpoon.get_length()

				if total_marks == 0 then
					return ""
				end

				local current_mark = "—"

				local mark_idx = harpoon.get_current_index()
				if mark_idx ~= nil then
					current_mark = tostring(mark_idx)
				end

				return string.format("󱡅 %s/%d", current_mark, total_marks)
			end

			-- vcsigns diff stats component
			local function vcsigns_diff()
				local bufnr = vim.api.nvim_get_current_buf()
				local ok, stats = pcall(function()
					return vim.b[bufnr].vcsigns_status
				end)
				if not ok or not stats then
					return ""
				end
				return stats
			end

			require("lualine").setup({
				options = {
					theme = "catppuccin",
					globalstatus = true,
					component_separators = { left = "", right = "" },
					section_separators = { left = "█", right = "█" },
				},
				sections = {
					lualine_b = {
						{ get_vcs_info, icon = "" },
						harpoon_component,
						{
							"diff",
							source = function()
								local bufnr = vim.api.nvim_get_current_buf()
								local summary = vim.b[bufnr].vcsigns_summary
								if summary then
									return {
										added = summary.added or 0,
										modified = summary.modified or 0,
										removed = summary.removed or 0,
									}
								end
								return nil
							end,
						},
						"diagnostics",
					},
					lualine_c = {
						{ "filename", path = 1 },
					},
					lualine_x = {
						"filetype",
					},
				},
			})
		end,
	},
}
