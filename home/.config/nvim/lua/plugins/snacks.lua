local filtered_message = { "No information available" }

return {
	{
		"folke/snacks.nvim",
		priority = 1000,
		lazy = false,

		---@type snacks.Config
		opts = {
			bigfile = { enabled = true },
			bufdelete = { enabled = true },
			dim = { enabled = true },
			gitbrowse = { enabled = true },
			indent = { enabled = true },
			input = { enabled = true },
			notifier = {
				enabled = true,
				timeout = 3000,
				style = "fancy",
			},
			rename = { enabled = true },
			toggle = { enabled = true },
			scratch = { enabled = true },
			statuscolumn = { enabled = true },
			words = { enabled = true },
		},

		init = function()
			vim.api.nvim_create_autocmd("User", {
				pattern = "VeryLazy",
				callback = function()
					local notify = Snacks.notifier.notify
					---@diagnostic disable-next-line: duplicate-set-field
					Snacks.notifier.notify = function(message, level, opts)
						for _, msg in ipairs(filtered_message) do
							if message == msg then
								return nil
							end
						end
						return notify(message, level, opts)
					end
				end,
			})

			vim.api.nvim_create_autocmd("User", {
				pattern = "OilActionsPost",
				callback = function(event)
					if event.data.actions.type == "move" then
						Snacks.rename.on_rename_file(event.data.actions.src_url, event.data.actions.dest_url)
					end
				end,
			})
		end,
		keys = {
			{
				"<leader>bd",
				function()
					Snacks.bufdelete()
				end,
				desc = "[B]uffer [D]elete",
			},
			{
				"<leader>og",
				function()
					Snacks.gitbrowse()
				end,
				desc = "[O]pen [G]it",
				mode = { "n", "v" },
			},
			{
				"<leader>nh",
				function()
					Snacks.notifier.show_history()
				end,
				desc = "[N]otification [H]istory",
			},
			{
				"<leader>nd",
				function()
					Snacks.notifier.hide()
				end,
				desc = "[N]otifications [D]ismiss",
			},
			{
				"<leader>nh",
				function()
					Snacks.notifier.show_history()
				end,
				desc = "[N]otification [H]istory",
			},
			{
				"<leader>ln",
				function()
					Snacks.toggle.option("relativenumber", { name = "Relative Number" }):toggle()
				end,
				desc = "Toggle Relative [L]ine [N]umbers",
			},
			{
				"<leader>cl",
				function()
					Snacks.toggle.option("cursorline", { name = "Cursor Line" }):toggle()
				end,
				desc = "Toggle [C]ursor [L]ine",
			},
			{
				"<leader>td",
				function()
					Snacks.toggle.diagnostics():toggle()
				end,
				desc = "[T]oggle [D]iagnostics",
			},
			{
				"<leader>zm",
				function()
					Snacks.toggle.dim():toggle()
				end,
				desc = "Toggle Dim Mode",
			},
			{
				"<leader>tw",
				function()
					Snacks.toggle.option("wrap"):toggle()
				end,
				desc = "[T]oggle line [W]rap",
			},
			{
				"<leader>tx",
				function()
					local tsc = require("treesitter-context")
					Snacks.toggle({
						name = "Treesitter Context",
						get = tsc.enabled,
						set = function(state)
							if state then
								tsc.enable()
							else
								tsc.disable()
							end
						end,
					}):toggle()
				end,
				desc = "Toggle [T]reesitter Conte[x]t",
			},
			{
				"<leader>ih",
				function()
					Snacks.toggle({
						name = "Inlay Hints",
						get = function()
							return vim.lsp.inlay_hint.is_enabled()
						end,
						set = function(state)
							if state then
								vim.lsp.inlay_hint.enable(true)
							else
								vim.lsp.inlay_hint.enable(false)
							end
						end,
					}):toggle()
				end,
				desc = "Toggle [I]nlay [H]ints",
			},
			{
				"<leader>hl",
				function()
					local hc = require("nvim-highlight-colors")
					Snacks.toggle({
						name = "Highlight Colors",
						get = function()
							return hc.is_active()
						end,
						set = function(state)
							if state then
								hc.turnOn()
							else
								hc.turnOff()
							end
						end,
					}):toggle()
				end,
				desc = "Toggle [H]igh[L]ight Colors",
			},
			{
				"<leader>.",
				function()
					Snacks.scratch()
				end,
				desc = "Toggle Scratch Buffer",
			},
			{
				"<leader>s.",
				function()
					Snacks.scratch.select()
				end,

				desc = "Search Scratch Buffers",
			},
		},
	},
}
