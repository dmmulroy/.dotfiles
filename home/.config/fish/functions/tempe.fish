function tempe -d "Convert temperatures between Celsius and Fahrenheit"
  if test (count $argv) -lt 1
    echo "Usage: tempe <temperature>[c|f]"
    echo "Examples:"
    echo "  tempe 32f     # 32°F to Celsius"
    echo "  tempe 100c    # 100°C to Fahrenheit"
    echo "  tempe 0       # Assumes Celsius"
    return 1
  end

  set -l input $argv[1]
  set -l temp
  set -l unit

  # Parse input
  if string match -qr '^-?[0-9]+\.?[0-9]*[fF]$' $input
    set temp (string replace -r '[fF]' '' $input)
    set unit f
  else if string match -qr '^-?[0-9]+\.?[0-9]*[cC]?$' $input
    set temp (string replace -r '[cC]' '' $input)
    set unit c
  else
    echo "Error: Invalid temperature format"
    return 1
  end

  # Convert
  if test $unit = f
    # Fahrenheit to Celsius
    set -l celsius (math "($temp - 32) * 5 / 9")
    printf "%s°F = %.2f°C\n" $temp $celsius
  else
    # Celsius to Fahrenheit
    set -l fahrenheit (math "$temp * 9 / 5 + 32")
    printf "%s°C = %.2f°F\n" $temp $fahrenheit
  end
end
