#!/bin/bash

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Step 1: Install Brew
echo "Step 1: Installing Brew"
if command_exists brew; then
  echo "Brew is already installed."
else
  echo "Brew is not installed. Installing now..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if command_exists brew; then
    echo "Brew installation successful!"
  else
    echo "Brew installation failed. Please check the output above for errors."
    exit 1
  fi
fi

# Step 2: Install base packages from Brewfile
echo "Step 2: Installing base packages from Brewfile"
if brew bundle --file=./packages/bundle; then
  echo "Base packages installed successfully."
  read -p "Do you want to install work-specific packages from tmp/packages/bundle.work? (y/N): " install_work_deps

  if [[ "$install_work_deps" =~ ^[Yy]$ ]]; then
    echo "Installing work packages..."
    if brew bundle --file=./packages/bundle.work; then
      echo "Work packages installed successfully."
    else
      echo "Failed to install work packages. Please check the output above."
      echo "Continuing initialization despite work package installation issues."
    fi
  else
    echo "Skipping work package installation."
  fi
else
  echo "Failed to install base packages. Please check the output above."
  exit 1
fi


# Step 3: Install Fisher and Fish plugins
echo "Step 3: Installing Fisher and Fish plugins"
if command_exists fisher; then
  echo "Fisher is already installed."
else
  echo "Fisher is not installed. Installing via Brew..."
  if brew install fisher; then
    echo "Fisher installed successfully."
  else
    echo "Failed to install Fisher. Please check Brew output."
  fi
fi

# Ensure fish is available before trying to use fisher
if command_exists fish && command_exists fisher; then
  echo "Installing Fish plugins using Fisher..."
  # Note: Running fish commands non-interactively can be tricky.
  # This approach executes the fisher install commands directly within a fish shell.
  fish -c "fisher install jhillyerd/plugin-git jethrokuan/z"
  echo "Fish plugin installation attempted."
else
  echo "Fish or Fisher command not found. Skipping Fish plugin installation."
  echo "Ensure Fish is installed (e.g., via the Brewfile) before this step."
fi


# Step 5: Install Bun
echo "Step 5: Installing Bun"
if ! command_exists bun; then
  echo "Installing Bun..." && curl -fsSL https://bun.sh/install | bash;
  else echo "Bun already installed.";
fi


echo "Initialization complete!"

exit 0
