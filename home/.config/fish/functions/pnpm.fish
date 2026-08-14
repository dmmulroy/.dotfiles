function pnpm --description "Run pnpm, using Vite+ for dlx"
    if test (count $argv) -gt 0; and test "$argv[1]" = dlx
        command vpx $argv[2..-1]
    else
        command pnpm $argv
    end
end
