-- Theme

-- Themes, fonts, tab style, and sidebar are app settings, not config options.
-- This action imports the tracked Catppuccin Macchiato theme into the app.
rex.action({
	name = "import_catppuccin_macchiato",
	title = "Import Catppuccin Macchiato Theme",
	category = "Appearance",
	keywords = "theme catppuccin macchiato dotfiles",
	run = function()
		local home = os.getenv("HOME")
		rex.client.queue("client.theme.import", {
			path = home .. "/.config/rex/themes/catppuccin-macchiato",
		})
	end,
})
