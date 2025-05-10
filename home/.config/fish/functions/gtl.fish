function gtl -d "List tags matching prefix" -a prefix
  git tag --sort=-v:refname -n -l $prefix\*
end
