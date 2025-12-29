function trash -d "Move files to trash instead of deleting"
  if test (count $argv) -lt 1
    echo "Usage: trash <file>..."
    echo "Move files to the trash instead of permanently deleting them"
    return 1
  end

  # Determine trash directory
  set -l trash_dir
  if test (uname) = Darwin
    set trash_dir ~/.Trash
  else if test -n "$XDG_DATA_HOME"
    set trash_dir $XDG_DATA_HOME/Trash/files
  else
    set trash_dir ~/.local/share/Trash/files
  end

  # Create trash directory if it doesn't exist
  if not test -d $trash_dir
    mkdir -p $trash_dir
  end

  # Move each file to trash
  for file in $argv
    if not test -e $file
      echo "Error: '$file' does not exist"
      continue
    end

    set -l basename (basename $file)
    set -l dest $trash_dir/$basename

    # Handle filename conflicts by appending timestamp
    if test -e $dest
      set dest "$trash_dir/$basename."(date +%s)
    end

    mv -v $file $dest
  end
end
