###-begin-wrangler-completions-###
#
# wrangler fish completion
#
# Installation: wrangler completions fish > ~/.config/fish/completions/wrangler.fish
#

function __wrangler_prepare_completions
  set -l tokens (commandline -opc)
  set -l current (commandline -ct)
  # Use -- to stop yargs from parsing flags in the completion args
  set --global __wrangler_comp_results (wrangler __complete -- $tokens $current 2>/dev/null)
  return 0
end

complete -c wrangler -f -n '__wrangler_prepare_completions' -a '$__wrangler_comp_results'
###-end-wrangler-completions-###
