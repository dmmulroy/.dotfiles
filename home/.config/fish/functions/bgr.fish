function bgr -d "Run command in background (completely detached)"
  if test (count $argv) -lt 1
    echo "Usage: bgr <command> [args...]"
    echo "Run a command completely in the background"
    return 1
  end

  $argv &>/dev/null &
  disown
end
