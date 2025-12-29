function scratch -d "Open a temporary file in editor"
  set -l tmpfile (mktemp)
  if set -q EDITOR
    $EDITOR $tmpfile
  else if command -v nvim &>/dev/null
    nvim $tmpfile
  else if command -v vim &>/dev/null
    vim $tmpfile
  else
    nano $tmpfile
  end
end
