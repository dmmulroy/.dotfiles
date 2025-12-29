function bb -d "Open a bare-bones text editor"
  # Use the simplest available editor
  if set -q EDITOR
    $EDITOR $argv
  else if command -v nano &>/dev/null
    nano $argv
  else if command -v vim &>/dev/null
    vim $argv
  else if command -v vi &>/dev/null
    vi $argv
  else
    echo "Error: No text editor found. Set \$EDITOR environment variable."
    return 1
  end
end
