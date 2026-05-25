# Vite+ task completion is project-dependent; query it only when completion is requested.
function __vpr_complete --description "Complete Vite+ project tasks on demand"
    set -l tokens (commandline --current-process --tokenize --cut-at-cursor)
    set -l current (commandline --current-token)
    VP_COMPLETE=fish command vp -- vp run $tokens[2..] $current
end

complete -c vpr --keep-order --exclusive --arguments "(__vpr_complete)"
