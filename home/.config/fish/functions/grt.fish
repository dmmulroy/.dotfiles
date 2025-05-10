function grt -d "cd into the top of the current repository or submodule"
  cd (git rev-parse --show-toplevel; or echo ".")
end
