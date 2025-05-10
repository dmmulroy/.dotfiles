function fvim
    if test (count $argv) -eq 0
        fd -t f | fzf --header "Open File in Vim" --preview "cat {}" | xargs nvim
    else
        set -l query (string join " " $argv)
        fd -t f | fzf --header "Open File in Vim" --preview "cat {}" -q "$query" | xargs nvim
    end
end

function vim
    if test (count $argv) -eq 0
        nvim .
    else
        nvim $argv
    end
end

function vi
    if test (count $argv) -eq 0
        nvim .
    else
        nvim $argv
    end
end
