{
  git_log_n = ''
    if test (count $argv) -eq 0
        git log --color=always --graph --decorate --abbrev-commit --date=relative --format=format:'%C(auto)%h %C(bold blue)%an %C(bold green)%ad %C(magenta)%d%n%C(reset)  │  %C(white)%s%C(reset)'  | sed 's/\(\(origin\/\)\?[a-zA-Z0-9-]*\/[a-zA-Z]*-[0-9]*\)-[a-zA-Z0-9-]*/\1/g'
    else
        git log --color=always --graph --decorate --abbrev-commit --date=relative --format=format:'%C(auto)%h %C(bold blue)%an %C(bold green)%ad %C(magenta)%d%n%C(reset)  │  %C(white)%s%C(reset)'  -n $argv[1] | sed 's/\(\(origin\/\)\?[a-zA-Z0-9-]*\/[a-zA-Z]*-[0-9]*\)-[a-zA-Z0-9-]*/\1/g'
    end
  '';
  gpr = ''
    if test (count $argv) -ne 1
        echo "Usage: gpr <pull_request_number>"
        return 1
    end

    set pr_num $argv[1]
    git fetch origin pull/$pr_num/head:pr$pr_num
    git checkout pr$pr_num
  '';
  fvim = ''
    if test (count $argv) -eq 0
      fd -t f | fzf --header "Open File in Vim" --preview "cat {}" | xargs nvim
    else
      set -l query (string join " " $argv)
      fd -t f | fzf --header "Open File in Vim" --preview "cat {}" -q "$query" | xargs nvim
    end
  '';
  vim = ''
    if test (count $argv) -eq 0
      nvim .
    else
      nvim $argv
    end
  '';
  vi = ''
    if test (count $argv) -eq 0
      nvim .
    else
      nvim $argv
    end
  '';
}
