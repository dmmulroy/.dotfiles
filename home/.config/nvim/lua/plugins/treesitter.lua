local parser_languages = {
	"bash",
	"css",
	"gleam",
	"go",
	"html",
	"javascript",
	"json",
	"lua",
	"markdown",
	"markdown_inline",
	"ocaml",
	"ocaml_interface",
	"rust",
	"svelte",
	"terraform",
	"tsx",
	"typescript",
	"vimdoc",
	"yaml",
	"zig",
}

local function install_missing_parsers()
	local treesitter = require("nvim-treesitter")
	local installed = {}

	for _, language in ipairs(treesitter.get_installed()) do
		installed[language] = true
	end

	local missing = vim.tbl_filter(function(language)
		return not installed[language]
	end, parser_languages)

	if #missing > 0 then
		treesitter.install(missing)
	end
end

return {
	{
		"nvim-treesitter/nvim-treesitter",
		branch = "main",
		lazy = false,
		build = function()
			local treesitter = require("nvim-treesitter")
			treesitter.install(parser_languages):wait(300000)
			treesitter.update(parser_languages):wait(300000)
		end,
		config = function()
			require("nvim-treesitter").setup({})
			install_missing_parsers()
		end,
	},
	{
		"nvim-treesitter/nvim-treesitter-textobjects",
		branch = "main",
		dependencies = { "nvim-treesitter/nvim-treesitter" },
		config = function()
			require("nvim-treesitter-textobjects").setup({
				select = {
					lookahead = true,
				},
				move = {
					set_jumps = true,
				},
			})
		end,
	},
	{
		"nvim-treesitter/nvim-treesitter-context",
		dependencies = { "nvim-treesitter/nvim-treesitter" },
		config = function()
			local tsc = require("treesitter-context")

			tsc.setup({
				enable = false,
				max_lines = 1,
				trim_scope = "inner",
			})
		end,
	},
}
