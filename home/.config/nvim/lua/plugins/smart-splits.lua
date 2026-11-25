-- Seamless <C-h/j/k/l> navigation between Neovim splits and multiplexer panes.
--
-- Moves between Neovim windows; at an edge window the Rex backend moves focus
-- into the neighbouring Rex pane. Rex forwards <C-h/j/k/l> to Neovim when it is
-- the foreground process (ctrl+h/j/k/l function bindings in
-- home/.config/rex/dmmulroy/smart_splits.lua). Outside Rex, it falls back to
-- plain Neovim window navigation.
return {
	{
		"smart-splits-nvim/smart-splits.nvim",
		version = "^3.0.0",
		dependencies = {
			{ "rawnly/smart-splits-backend-rex", main = "smart-splits-backend-rex", opts = {} },
		},
		opts = {
			-- Do nothing at the outer edge.
			move = { at_edge = "stop" },
			mux = {
				backend = { "smart-splits-backend-rex" },
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
