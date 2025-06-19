return {
	{
		"L3MON4D3/LuaSnip",
		event = "InsertEnter",
		build = "make install_jsregexp",
		dependencies = {
			{
				"rafamadriz/friendly-snippets",
				config = function()
					require("luasnip.loaders.from_vscode").lazy_load()
					require("luasnip.loaders.from_vscode").lazy_load({
						paths = { vim.fn.stdpath("config") .. "/snippets" },
					})
				end,
			},
		},
		config = function()
			local ls = require("luasnip")

			ls.config.set_config({
				history = true,
				updateevents = "TextChanged,TextChangedI",
			})
		end,
	},
}
