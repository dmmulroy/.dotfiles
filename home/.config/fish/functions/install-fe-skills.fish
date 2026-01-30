function install-fe-skills -d "Install frontend OpenCode skills to current project"
  set -l skills \
    "vercel-labs/agent-browser@agent-browser" \
    "anthropics/skills@frontend-design" \
    "remotion-dev/skills@remotion-best-practices" \
    "vercel-labs/agent-skills@vercel-react-best-practices" \
    "vercel-labs/agent-skills@web-design-guidelines"

  for skill in $skills
    echo "Installing $skill..."
    npx skills add $skill -a opencode -y
    or begin
      echo "Failed to install $skill"
      return 1
    end
  end

  echo "All frontend skills installed"
end
