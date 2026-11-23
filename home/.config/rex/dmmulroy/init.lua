-- Custom actions first: keymaps.lua binds some of them by name.
require("dmmulroy.close_pane_or_tab")
require("dmmulroy.import_theme")
-- Twitch chat: palette action "Twitch Chat: Toggle" (no keybinding).
require("dmmulroy.twitch_chat")
-- Palette action "Transfer pi Session to Host…" (also /transfer in pi).
require("dmmulroy.transfer_pi_session")

require("dmmulroy.resize_mode")
require("dmmulroy.keymaps")
require("dmmulroy.smart_splits")
