# Vite+ environment setup (https://viteplus.dev)
#
# Keep only environment behavior in startup configuration. Vite+'s generated
# Fish setup executes `vp` to install dynamic completion registration eagerly;
# completions/vp.fish and completions/vpr.fish register those completions lazily.
fish_add_path --global --move --path "$HOME/.vite-plus/bin"

function vp --description "Run Vite+ and apply environment changes to this shell"
    if test (count $argv) -ge 2; and test "$argv[1]" = "env"; and test "$argv[2]" = "use"
        if contains -- -h $argv; or contains -- --help $argv
            command vp $argv
            return
        end
        set -lx VP_ENV_USE_EVAL_ENABLE 1
        set -l __vp_out (env FISH_VERSION=$FISH_VERSION "$HOME/.vite-plus/bin/vp" $argv); or return $status
        eval (string join ';' $__vp_out)
    else
        command vp $argv
    end
end
