function rn -d "Rename files with a friendly interface"
  if test (count $argv) -lt 2
    echo "Usage: rn <source> <destination>"
    echo "Rename files or directories"
    return 1
  end

  set -l source $argv[1]
  set -l dest $argv[2]

  if not test -e $source
    echo "Error: '$source' does not exist"
    return 1
  end

  if test -e $dest
    echo "Error: '$dest' already exists"
    return 1
  end

  mv -v $source $dest
end
