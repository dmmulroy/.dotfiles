function git_rebase_stack -d "Rebase stack of branches onto base and push to origin"
  argparse 'b/base=' 'd/dry-run' -- $argv
  or return 1

  set -l original_branch (git branch --show-current)
  set -l base $_flag_base

  # Auto-detect stack if no branches provided
  if test (count $argv) -eq 0
    set -l stack (string split ' ' (__git_rebase_stack.detect $original_branch))
    if test (count $stack) -eq 0 -o "$stack[1]" = ""
      echo "No stack detected from current branch"
      return 1
    end
    set argv $stack

    # Auto-detect base from bottom PR
    if test -z "$base"
      set base (gh pr view $argv[1] --json baseRefName -q '.baseRefName' 2>/dev/null)
    end
  end

  if test -z "$base"
    set base (__git.default_branch)
  end

  echo "Base: $base"
  echo "Stack: $argv"

  if set -q _flag_dry_run
    return 0
  end

  git fetch origin $base
  or return 1

  for i in (seq (count $argv))
    set -l branch $argv[$i]
    set -l rebase_onto

    if test $i -eq 1
      set rebase_onto origin/$base
    else
      set rebase_onto $argv[(math $i - 1)]
    end

    echo "Rebasing $branch onto $rebase_onto..."
    git checkout $branch
    or return 1

    git rebase $rebase_onto
    or begin
      echo "Rebase failed for $branch. Aborting."
      git rebase --abort
      git checkout $original_branch
      return 1
    end

    echo "Pushing $branch..."
    git push --force-with-lease origin $branch
    or return 1
  end

  git checkout $original_branch
  echo "Done. All branches rebased and pushed."
end

function __git_rebase_stack.detect -d "Detect PR stack containing branch" -a branch
  # Get all open PRs by current user
  set -l prs (gh pr list --author @me --state open --json headRefName,baseRefName 2>/dev/null)
  or return 1

  # Build map of base -> head relationships
  set -l heads (echo $prs | jq -r '.[].headRefName' | string split \n)
  set -l bases (echo $prs | jq -r '.[].baseRefName' | string split \n)

  # Find the bottom of the stack (base is main/staging/master, not another PR)
  set -l stack_bottom
  for i in (seq (count $heads))
    if contains -- $branch $heads[$i]
      # Walk down to find bottom
      set -l current $branch
      while true
        set -l found_base
        for j in (seq (count $heads))
          if test "$heads[$j]" = "$current"
            set found_base $bases[$j]
            break
          end
        end

        # Check if base is another PR head
        if contains -- $found_base $heads
          set current $found_base
        else
          set stack_bottom $current
          break
        end
      end
      break
    end
  end

  if test -z "$stack_bottom"
    return 1
  end

  # Build stack from bottom up
  set -l stack $stack_bottom
  set -l current $stack_bottom
  while true
    set -l found_child
    for i in (seq (count $heads))
      if test "$bases[$i]" = "$current"
        set found_child $heads[$i]
        break
      end
    end

    if test -n "$found_child"
      set -a stack $found_child
      set current $found_child
    else
      break
    end
  end

  echo $stack
end

complete -c git_rebase_stack -x -a "(git branch --format='%(refname:short)')"
complete -c git_rebase_stack -s b -l base -d "Base branch" -xa "(git branch --format='%(refname:short)')"
complete -c git_rebase_stack -s d -l dry-run -d "Show stack without rebasing"
