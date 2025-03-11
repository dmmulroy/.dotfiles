vim.api.nvim_create_autocmd("User", {
	pattern = "BlinkCmpMenuOpen",
	callback = function()
		require("copilot.suggestion").dismiss()
		vim.b.copilot_suggestion_hidden = true
	end,
})

vim.api.nvim_create_autocmd("User", {
	pattern = "BlinkCmpMenuClose",
	callback = function()
		vim.b.copilot_suggestion_hidden = false
	end,
})
return {
	{
		"saghen/blink.cmp",
		dependencies = {
			"rafamadriz/friendly-snippets",
			"onsails/lspkind.nvim",
			"nvim-tree/nvim-web-devicons",
			-- "fang2hou/blink-copilot",
		},
		version = "*",
		opts = {
			appearance = {
				use_nvim_cmp_as_default = true,
				nerd_font_variant = "mono",
			},
			completion = {
				documentation = {
					auto_show = true,
					window = {
						border = "rounded",
					},
				},
				ghost_text = { enabled = true },
				menu = {
					border = "rounded",
					draw = {
						columns = {
							{ "label", "label_description", gap = 1 },
							{ "kind_icon", "kind", gap = 1 },
							{ "source_name" },
						},
						components = {
							source_name = {
								text = function(ctx)
									return "[" .. ctx.source_name .. "]"
								end,
							},
							kind_icon = {
								ellipsis = false,
								text = function(ctx)
									local icon = ctx.kind_icon
									if vim.tbl_contains({ "Path" }, ctx.source_name) then
										local dev_icon, _ = require("nvim-web-devicons").get_icon(ctx.label)
										if dev_icon then
											icon = dev_icon
										end
									elseif ctx.source_name == "Copilot" then
										icon = ""
									else
										icon = require("lspkind").symbolic(ctx.kind, {
											mode = "symbol",
										})
									end
									return icon .. ctx.icon_gap
								end,
								highlight = function(ctx)
									local hl = ctx.kind_hl
									if vim.tbl_contains({ "Path" }, ctx.source_name) then
										local dev_icon, dev_hl = require("nvim-web-devicons").get_icon(ctx.label)
										if dev_icon then
											hl = dev_hl
										end
									end
									return hl
								end,
							},
						},
					},
				},
			},
			keymap = {
				preset = "default",
				["<C-k>"] = { "select_prev", "fallback" },
				["<C-j>"] = { "select_next", "fallback" },
				["<C-u>"] = { "scroll_documentation_up", "fallback" },
				["<C-d>"] = { "scroll_documentation_down", "fallback" },
				["<Tab>"] = {
					function(cmp)
						if cmp.is_menu_visible() then
							return cmp.select_next()
						elseif vim.snippet.active() then
							return vim.snippet.jump(1)
						else
							return
						end
					end,
					"fallback",
				},
				["<S-Tab>"] = {
					function(cmp)
						if cmp.is_menu_visible() then
							return cmp.select_prev()
						elseif vim.snippet.active() then
							return vim.snippet.jump(-1)
						else
							return
						end
					end,
					"fallback",
				},
				["<C-c>"] = { "cancel" },
				["<CR>"] = { "accept", "fallback" },
			},
			-- signature = { enabled = true },
			sources = {
				default = { "lsp", "path", "snippets", "buffer" },
				-- default = { "lsp", "path", "snippets", "buffer", "copilot" },
				providers = {
					buffer = {
						max_items = 5,
					},
					-- copilot = {
					-- 	async = true,
					-- 	name = "Copilot",
					-- 	module = "blink-copilot",
					-- 	score_offset = 4,
					-- },
					lsp = {
						score_offset = 5,
					},
					path = {
						max_items = 3,
					},
				},
			},
		},
	},
}
