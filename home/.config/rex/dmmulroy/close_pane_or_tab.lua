-- herdr semantics for close pane: close the tab along with its last pane.
-- Rex's pane.close doesn't, so count the tab's panes first.
-- Bound to C-; x in dmmulroy/keymaps.lua.

local function count_window_blocks(window)
	local count = 0
	for _, layer in ipairs(window.layers or {}) do
		count = count + #(layer.blocks or {})
	end
	return count
end

rex.action({
	name = "close_pane_or_tab",
	title = "Close Pane (or Tab if Last Pane)",
	category = "Panes",
	keywords = "close pane tab last herdr",
	run = function(ctx)
		local view = rex.session.view({})
		local window
		for _, w in ipairs((view and view.windows) or {}) do
			for _, layer in ipairs(w.layers or {}) do
				for _, block in ipairs(layer.blocks or {}) do
					if block.block_id == ctx.block_id then
						window = w
					end
				end
			end
			if not window and w.window_id == (view and view.active_window_id) then
				window = w
			end
		end
		if window and count_window_blocks(window) <= 1 then
			rex.client.queue("client.tab.close", {})
		else
			rex.client.queue("pane.close", {})
		end
	end,
})
