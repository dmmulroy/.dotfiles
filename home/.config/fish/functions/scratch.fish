function scratch -d "Create and open a temporary scratch file"
  # Create a scratch directory if it doesn't exist
  set -l scratch_dir /tmp/scratch
  if not test -d $scratch_dir
    mkdir -p $scratch_dir
  end

  # Generate filename
  set -l timestamp (date +%Y%m%d_%H%M%S)
  set -l filename
  
  if test (count $argv) -gt 0
    # Use provided name with timestamp
    set filename "$scratch_dir/$argv[1]_$timestamp"
  else
    # Default scratch file name
    set filename "$scratch_dir/scratch_$timestamp.txt"
  end

  # Create and open the file
  touch $filename
  echo "Created scratch file: $filename"
  
  # Open in editor
  if set -q EDITOR
    $EDITOR $filename
  else if command -v nano &>/dev/null
    nano $filename
  else
    echo "File created at: $filename"
    echo "No editor found. Set \$EDITOR to edit automatically."
  end
end
