-- Rex configuration
-- Managed in ~/.dotfiles and stowed to ~/.config/rex/init.lua.
-- Full reference: https://www.superlogical.com/rex/docs/reference/lua
--
-- Bootstrap only; the config lives in dmmulroy/ (see dmmulroy/init.lua).
--
-- Rex does not watch these files. After editing, run:
--   rex config check    # load the file and report mistakes, changing nothing
--   rex config reload   # make the running server read it again
--   rex keymap          # show the merged keymap the server resolved
-- `dot update` runs check + reload after re-stowing.

require("dmmulroy")
