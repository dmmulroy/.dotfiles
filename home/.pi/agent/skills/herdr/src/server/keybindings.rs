use crate::app;

pub(crate) fn app_keybindings(app: &app::App) -> crate::config::LiveKeybindConfig {
    crate::config::LiveKeybindConfig {
        prefix: (app.state.prefix_code, app.state.prefix_mods),
        keybinds: app.state.keybinds.clone(),
    }
}

pub(crate) fn apply_keybindings(
    app: &mut app::App,
    keybindings: &crate::config::LiveKeybindConfig,
) {
    app.state.prefix_code = keybindings.prefix.0;
    app.state.prefix_mods = keybindings.prefix.1;
    app.state.keybinds = keybindings.keybinds.clone();
}
