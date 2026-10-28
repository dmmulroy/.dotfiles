-- Seamless <C-h/j/k/l> navigation between Neovim splits and multiplexer panes.
--
-- Moves between Neovim windows; at an edge window the first detected backend
-- moves focus into the neighbouring multiplexer pane. The multiplexer side
-- forwards <C-h/j/k/l> to Neovim when it is the foreground process:
--   Herdr: vim-herdr-navigation plugin (home/.config/herdr/config.toml)
--   Rex:   ctrl+h/j/k/l function bindings (home/.config/rex/init.lua)
-- Herdr is listed first because it is the inner multiplexer when nested.
-- Outside both, it falls back to plain Neovim window navigation.
return {
	{
		"smart-splits-nvim/smart-splits.nvim",
		version = "^3.0.0",
		dependencies = {
			{ "adriankarlen/smart-splits-backend-herdr", main = "smart-splits-backend-herdr", opts = {} },
			{ "rawnly/smart-splits-backend-rex", main = "smart-splits-backend-rex", opts = {} },
		},
		opts = {
			-- Match the old Herdr navigation: do nothing at the outer edge.
			move = { at_edge = "stop" },
			mux = {
				backend = { "smart-splits-backend-herdr", "smart-splits-backend-rex" },
			},
		},
		keys = {
			{
				"<C-h>",
				function()
					require("smart-splits").move_cursor_left()
				end,
				desc = "Navigate left (Vim/mux)",
			},
			{
				"<C-j>",
				function()
					require("smart-splits").move_cursor_down()
				end,
				desc = "Navigate down (Vim/mux)",
			},
			{
				"<C-k>",
				function()
					require("smart-splits").move_cursor_up()
				end,
				desc = "Navigate up (Vim/mux)",
			},
			{
				"<C-l>",
				function()
					require("smart-splits").move_cursor_right()
				end,
				desc = "Navigate right (Vim/mux)",
			},
		},
	},
}
