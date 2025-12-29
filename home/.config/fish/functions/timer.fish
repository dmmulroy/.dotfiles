function timer -d "Countdown timer with notification"
  if test (count $argv) -lt 1
    echo "Usage: timer <duration>"
    echo "Duration examples: 5s, 10m, 1h, 90"
    echo "Default unit is seconds if no suffix provided"
    return 1
  end

  set -l duration $argv[1]
  set -l seconds 0

  # Parse duration
  if string match -qr '^[0-9]+s$' $duration
    set seconds (string replace 's' '' $duration)
  else if string match -qr '^[0-9]+m$' $duration
    set seconds (math (string replace 'm' '' $duration) '*' 60)
  else if string match -qr '^[0-9]+h$' $duration
    set seconds (math (string replace 'h' '' $duration) '*' 3600)
  else if string match -qr '^[0-9]+$' $duration
    set seconds $duration
  else
    echo "Error: Invalid duration format"
    echo "Use formats like: 5s, 10m, 1h, or just a number for seconds"
    return 1
  end

  echo "Timer started for $seconds seconds..."
  sleep $seconds
  echo "⏰ Time's up!"
  
  # Send notification if notify function is available
  if functions -q notify
    notify "Timer finished!" "⏰ Timer"
  else if command -v osascript &>/dev/null
    osascript -e "display notification \"Timer finished!\" with title \"⏰ Timer\""
  end
  
  # Try to make a sound
  if command -v afplay &>/dev/null
    afplay /System/Library/Sounds/Glass.aiff &>/dev/null &
  else if command -v tput &>/dev/null
    tput bel
  end
end
