function nato -d "Convert text to NATO phonetic alphabet"
  if test (count $argv) -lt 1
    echo "Usage: nato <text>"
    echo "Convert text to NATO phonetic alphabet"
    echo "Example: nato hello"
    return 1
  end

  # NATO phonetic alphabet mapping
  set -l nato_a "Alpha"
  set -l nato_b "Bravo"
  set -l nato_c "Charlie"
  set -l nato_d "Delta"
  set -l nato_e "Echo"
  set -l nato_f "Foxtrot"
  set -l nato_g "Golf"
  set -l nato_h "Hotel"
  set -l nato_i "India"
  set -l nato_j "Juliet"
  set -l nato_k "Kilo"
  set -l nato_l "Lima"
  set -l nato_m "Mike"
  set -l nato_n "November"
  set -l nato_o "Oscar"
  set -l nato_p "Papa"
  set -l nato_q "Quebec"
  set -l nato_r "Romeo"
  set -l nato_s "Sierra"
  set -l nato_t "Tango"
  set -l nato_u "Uniform"
  set -l nato_v "Victor"
  set -l nato_w "Whiskey"
  set -l nato_x "X-ray"
  set -l nato_y "Yankee"
  set -l nato_z "Zulu"
  set -l nato_0 "Zero"
  set -l nato_1 "One"
  set -l nato_2 "Two"
  set -l nato_3 "Three"
  set -l nato_4 "Four"
  set -l nato_5 "Five"
  set -l nato_6 "Six"
  set -l nato_7 "Seven"
  set -l nato_8 "Eight"
  set -l nato_9 "Nine"

  set -l input (string join ' ' $argv | string lower)
  set -l result

  # Convert each character
  for i in (seq 1 (string length $input))
    set -l char (string sub -s $i -l 1 $input)
    
    if test "$char" = " "
      set result $result "/"
    else if string match -qr '^[a-z]$' $char
      set -l var_name "nato_$char"
      if set -q $var_name
        set result $result $$var_name
      else
        set result $result $char
      end
    else if string match -qr '^[0-9]$' $char
      set -l var_name "nato_$char"
      if set -q $var_name
        set result $result $$var_name
      else
        set result $result $char
      end
    else
      set result $result $char
    end
  end

  string join ' ' $result
end
