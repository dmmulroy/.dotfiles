return {
	{
		"L3MON4D3/LuaSnip",
		version = "2.*",
		event = "InsertEnter",
		dependencies = {
			"rafamadriz/friendly-snippets",
		},
		build = (function()
			-- Build Step is needed for regex support in snippets.
			-- This step is not supported in many windows environments.
			-- Remove the below condition to re-enable on windows.
			if vim.fn.has("win32") == 1 or vim.fn.executable("make") == 0 then
				return
			end
			return "make install_jsregexp"
		end)(),
		config = function()
			local ls = require("luasnip")

			-- Configuration
			ls.config.setup({
				-- Auto-exit snippets when cursor moves outside region
				region_check_events = "CursorMoved,CursorHold,InsertEnter",
				-- Clean up deleted snippets
				delete_check_events = "TextChanged",
				-- Update snippet dependents on text changes
				update_events = "TextChanged,TextChangedI",
				-- Allow jumping back to previous snippet nodes
				history = true,
				-- Enable autosnippets (snippets that expand automatically)
				enable_autosnippets = true,
			})

			-- Load snippet sources
			-- VSCode-style snippets from friendly-snippets
			require("luasnip.loaders.from_vscode").lazy_load()

			-- Custom VSCode-style snippets
			require("luasnip.loaders.from_vscode").lazy_load({
				paths = { vim.fn.stdpath("config") .. "/snippets" },
			})

			-- Lua snippets (with hot reload support)
			require("luasnip.loaders.from_lua").lazy_load({
				paths = { vim.fn.stdpath("config") .. "/snippets/lua" },
			})

			-- Keymaps
			-- Tab/S-Tab handled by nvim-cmp for expansion and jumping
			-- C-E for cycling through choice nodes
			vim.keymap.set({ "i", "s" }, "<C-e>", function()
				if ls.choice_active() then
					ls.change_choice(1)
				end
			end, { desc = "LuaSnip: Cycle choice node forward" })

			vim.keymap.set({ "i", "s" }, "<C-b>", function()
				if ls.choice_active() then
					ls.change_choice(-1)
				end
			end, { desc = "LuaSnip: Cycle choice node backward" })
		end,
	},
}
