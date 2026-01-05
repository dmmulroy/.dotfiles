return {
	{
		"catppuccin/nvim",
		lazy = false,
		priority = 1000,
		config = function()
			require("catppuccin").setup({
				-- float = {
				-- 	-- transparent = true,
				-- 	-- solid = false,
				-- },
				integrations = {
					diffview = true,
					fidget = true,
					harpoon = true,
					mason = true,
					native_lsp = { enabled = true },
					noice = true,
					notify = true,
					symbols_outline = true,
					snacks = {
						enabled = true,
						indent_scope_color = "mauve",
					},
					render_markdown = true,
					telescope = true,
					treesitter = true,
					treesitter_context = true,
					ufo = true,
					which_key = true,
				},
			})
			local palette = require("catppuccin.palettes").get_palette("macchiato")
			vim.cmd.colorscheme("catppuccin-macchiato")

			-- Telescope highlights to match editor background
			vim.api.nvim_set_hl(0, "TelescopeNormal", { bg = palette.base })
			vim.api.nvim_set_hl(0, "TelescopeBorder", { fg = palette.blue, bg = palette.base })
			vim.api.nvim_set_hl(0, "TelescopePromptNormal", { bg = palette.base })
			vim.api.nvim_set_hl(0, "TelescopePromptBorder", { fg = palette.blue, bg = palette.base })
			vim.api.nvim_set_hl(0, "TelescopeResultsNormal", { bg = palette.base })
			vim.api.nvim_set_hl(0, "TelescopeResultsBorder", { fg = palette.blue, bg = palette.base })
			vim.api.nvim_set_hl(0, "TelescopePreviewNormal", { bg = palette.base })
			vim.api.nvim_set_hl(0, "TelescopePreviewBorder", { fg = palette.blue, bg = palette.base })
			vim.api.nvim_set_hl(0, "TelescopeTitle", { fg = palette.mauve, bg = palette.base })
			vim.api.nvim_set_hl(0, "TelescopePromptTitle", { fg = palette.mauve, bg = palette.base })
			vim.api.nvim_set_hl(0, "TelescopeResultsTitle", { fg = palette.mauve, bg = palette.base })
			vim.api.nvim_set_hl(0, "TelescopePreviewTitle", { fg = palette.mauve, bg = palette.base })

			-- Hide all semantic highlights until upstream issues are resolved (https://github.com/catppuccin/nvim/issues/480)
			for _, group in ipairs(vim.fn.getcompletion("@lsp", "highlight")) do
				vim.api.nvim_set_hl(0, group, {})
			end
		end,
	},
}

-- rosewater = "#f4dbd6",
-- flamingo = "#f0c6c6",
-- pink = "#f5bde6",
-- mauve = "#c6a0f6",
-- red = "#ed8796",
-- maroon = "#ee99a0",
-- peach = "#f5a97f",
-- yellow = "#eed49f",
-- green = "#a6da95",
-- teal = "#8bd5ca",
-- sky = "#91d7e3",
-- sapphire = "#7dc4e4",
-- blue = "#8aadf4",
-- lavender = "#b7bdf8",
-- text = "#cad3f5",
-- subtext1 = "#b8c0e0",
-- subtext0 = "#a5adcb",
-- overlay2 = "#939ab7",
-- overlay1 = "#8087a2",
-- overlay0 = "#6e738d",
-- surface2 = "#5b6078",
-- surface1 = "#494d64",
-- surface0 = "#363a4f",
-- base = "#24273a",
-- mantle = "#1e2030",
-- crust = "#181926",
