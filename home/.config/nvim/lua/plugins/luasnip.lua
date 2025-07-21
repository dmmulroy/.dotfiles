return {
	{
		"L3MON4D3/LuaSnip",
		event = "InsertEnter",
		build = function()
			-- Force clean submodule update before building
			vim.fn.system("cd " .. vim.fn.stdpath("data") .. "/lazy/LuaSnip && git submodule update --init --recursive")
			require("lazy.util").float_cmd({ "make", "install_jsregexp" }, { cwd = vim.fn.stdpath("data") .. "/lazy/LuaSnip" })
		end,
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
