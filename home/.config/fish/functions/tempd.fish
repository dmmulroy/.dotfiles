function tempd -d "Display temperature from system sensors"
  # Try various methods to get temperature
  
  # macOS - try powermetrics (requires sudo) or osx-cpu-temp
  if test (uname) = Darwin
    # Try osx-cpu-temp if installed
    if command -v osx-cpu-temp &>/dev/null
      osx-cpu-temp
      return 0
    end
    
    # Try istats if installed
    if command -v istats &>/dev/null
      istats cpu temp
      return 0
    end
    
    echo "Error: No temperature sensor tool found"
    echo "Install osx-cpu-temp: brew install osx-cpu-temp"
    echo "Or install istats: gem install iStats"
    return 1
  end
  
  # Linux - try various sensor tools
  if test (uname) = Linux
    # Try sensors command
    if command -v sensors &>/dev/null
      sensors | grep -E "^(Core|Package|temp)" | head -5
      return 0
    end
    
    # Try reading from thermal zones directly
    if test -d /sys/class/thermal/thermal_zone0
      for zone in /sys/class/thermal/thermal_zone*/temp
        if test -r $zone
          set -l temp (cat $zone)
          set -l celsius (math "$temp / 1000")
          echo "Temperature: $celsius°C"
        end
      end
      return 0
    end
    
    echo "Error: No temperature sensor found"
    echo "Install lm-sensors: sudo apt install lm-sensors"
    return 1
  end
  
  echo "Error: Unsupported operating system"
  return 1
end
