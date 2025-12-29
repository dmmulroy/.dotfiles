function bg -d "Open URLs in browser in the background"
  if test (count $argv) -lt 1
    echo "Usage: bg <url>"
    echo "Open URLs in browser in the background"
    return 1
  end

  # Open each URL in the background
  for url in $argv
    # macOS
    if command -v open &>/dev/null
      open $url &>/dev/null &
      disown
    # Linux
    else if command -v xdg-open &>/dev/null
      xdg-open $url &>/dev/null &
      disown
    else
      echo "Error: No browser opener found (tried open, xdg-open)"
      return 1
    end
  end
end
