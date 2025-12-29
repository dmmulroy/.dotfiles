function rn -d "Right now - display current time and calendar"
  date "+%l:%M%p on %A, %B %d, %Y" | string trim
  echo
  cal
end
