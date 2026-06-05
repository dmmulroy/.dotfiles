function git_log_n -d "git log with graph, optionally limited to N commits"
    if set -q argv[1]
        git log --color=always --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' -$argv[1]
    else
        git log --color=always --graph --pretty='%Cred%h%Creset -%C(auto)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset'
    end
end
