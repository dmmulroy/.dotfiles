# git helpers adapted from fish git completion
function __fish_git_local_branches
    command git for-each-ref --format='%(refname:strip=2)' refs/heads/ 2>/dev/null
end

function __fish_git_remote_branches
    command git for-each-ref --format="%(refname:strip=3)" refs/remotes/ 2>/dev/null
end

# graphite helpers
function __gt_command_completions
    set -lx SHELL (type -p fish)
    set -l command (commandline -opc)
    # uncomment to include options, e.g. -q, --help
    # $command --get-yargs-completions
    # uncomment to exclude options (default)
    $command --get-yargs-completions | string replace -r '\-.*' ''
end

# disable file completions for the entire command
complete -c gt -f

# add completions as provided by CLI
complete -c gt -a "(__gt_command_completions)"

# commands that take branches
complete -c gt -x -n "__fish_seen_subcommand_from checkout co bco delete dl rename rn onto --onto -o tr utr track untrack" -a "(__fish_git_local_branches)"

# gt downstack get takes remote branches
complete -c gt -x -n "__fish_seen_subcommand_from ds dsg get g" -n "__fish_seen_subcommand_from get dsg" -a "(__fish_git_remote_branches)"
