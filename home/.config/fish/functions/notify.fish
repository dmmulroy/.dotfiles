function notify -d "Send a desktop notification"
  if test (count $argv) -lt 1
    echo "Usage: notify <message> [title]"
    echo "Send a desktop notification"
    return 1
  end

  set -l message $argv[1]
  set -l title "Notification"
  
  if test (count $argv) -ge 2
    set title $argv[2]
  end

  # macOS
  if command -v osascript &>/dev/null
    osascript -e "display notification \"$message\" with title \"$title\""
    return 0
  end

  # Linux with notify-send
  if command -v notify-send &>/dev/null
    notify-send "$title" "$message"
    return 0
  end

  # Fallback: just print to terminal
  echo "[$title] $message"
end
