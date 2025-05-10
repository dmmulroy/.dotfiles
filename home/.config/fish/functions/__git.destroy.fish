function __git.destroy
  for ab in $__git_plugin_abbreviations
    abbr -e $ab
  end
  set -Ue __git_plugin_abbreviations
  set -Ue __git_plugin_initialized
end
