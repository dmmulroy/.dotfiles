# Vite+ dynamic completion registration, lazy-loaded by Fish on completion.
# Mirrors the registration emitted by Vite+ v0.1.22 without launching `vp` at startup.
complete --keep-order --exclusive --command vp --arguments "(VP_COMPLETE=fish $HOME/.vite-plus/bin/vp -- (commandline --current-process --tokenize --cut-at-cursor) (commandline --current-token))"
