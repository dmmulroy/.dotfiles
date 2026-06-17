pub(crate) fn paste_payload_for_runtime(
    runtime: &crate::terminal::TerminalRuntime,
    text: &str,
) -> String {
    if runtime
        .input_state()
        .map(|state| state.bracketed_paste)
        .unwrap_or(false)
    {
        format!("\x1b[200~{text}\x1b[201~")
    } else {
        text.to_owned()
    }
}
