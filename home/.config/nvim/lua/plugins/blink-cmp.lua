return {
	{
		"saghen/blink.cmp",
		event = "VeryLazy",
		dependencies = {
			"rafamadriz/friendly-snippets",
			"L3MON4D3/LuaSnip",
		},
		version = "v1.*",
		opts = {
			keymap = {
				["<C-k>"] = { "select_prev", "show_signature", "hide_signature", "fallback" },
				["<C-j>"] = { "select_next", "fallback" },
				["<C-c>"] = { "cancel", "fallback" },
				["<CR>"] = { "select_and_accept", "fallback" },
				["<C-u>"] = { "scroll_documentation_up", "fallback" },
				["<C-d>"] = { "scroll_documentation_down", "fallback" },
				["<C-Space>"] = { "show", "fallback" },
				-- Tab behavior: navigate forward through suggestions or snippet placeholders
				["<Tab>"] = {
					function(cmp)
						if cmp.snippet_active() then
							return cmp.snippet_forward()
						else
							return cmp.select_next()
						end
					end,
					"fallback",
				},
				["<S-Tab>"] = {
					function(cmp)
						if cmp.snippet_active() then
							return cmp.snippet_backward()
						else
							return cmp.select_prev()
						end
					end,
					"fallback",
				},
			},
			appearance = {
				use_nvim_cmp_as_default = false,
				nerd_font_variant = "mono",
			},
			sources = {
				default = { "lsp", "path", "snippets", "buffer" },
				providers = {
					lsp = {
						score_offset = 1000, -- Extreme priority to override fuzzy matching
					},
					path = {
						score_offset = 3, -- File paths moderate priority
					},
					snippets = {
						score_offset = -100, -- Much lower priority
						max_items = 2, -- Limit snippet suggestions
						min_keyword_length = 3, -- Don't show for single chars
					},
					buffer = {
						score_offset = -150, -- Lowest priority
						min_keyword_length = 3, -- Only show after 3 chars
					},
				},
			},
			snippets = {
				preset = "luasnip",
			},
			signature = {
				enabled = true,
				trigger = {
					show_on_trigger_character = false,
					show_on_insert_on_trigger_character = false,
				},
				window = {
					border = "rounded",
					show_documentation = true,
				},
			},
			completion = {
				trigger = {
					show_on_trigger_character = true,
				},
				menu = {
					border = "rounded",
					max_height = 10,
					draw = {
						columns = {
							{ "kind_icon" },
							{ "label", "label_description", gap = 1 },
							{ "source_name" },
						},
						components = {
							-- Native icon support (no lspkind needed)
							source_name = {
								text = function(ctx)
									local source_names = {
										lsp = "[LSP]",
										buffer = "[Buffer]",
										path = "[Path]",
										snippets = "[Snippet]",
									}
									return (source_names[ctx.source_name] or "[") .. ctx.source_name .. "]"
								end,
								highlight = "CmpItemMenu",
							},
						},
					},
					auto_show = true,
				},
				documentation = {
					auto_show = true,
					window = {
						border = "rounded",
					},
				},
				ghost_text = {
					enabled = true,
				},
				list = {
					selection = {
						preselect = true,
					},
				},
				accept = {
					auto_brackets = {
						enabled = true,
					},
				},
			},
		},
	},
}
