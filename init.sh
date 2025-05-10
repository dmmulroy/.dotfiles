#!/bin/bash

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

Step 1: Install Brew
echo "Step 1: Installing Brew"
if command_exists brew; then
  echo "Brew is already installed."
else
  echo "Brew is not installed. Installing now..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if command_exists brew; then
    echo "Brew installation successful!"
    # Add brew to PATH for the current script session
    echo "Configuring Brew environment for this script session..."
    if [[ "$(uname -m)" == "arm64" ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    else
      eval "$(/usr/local/bin/brew shellenv)"
    fi
    echo "Brew environment configured."
  else
    echo "Brew installation failed. Please check the output above for errors."
    exit 1
  fi
fi

# Step 2: Install base packages from Brewfile
echo "Step 2: Installing base packages from Brewfile"
if brew bundle --file=./packages/bundle; then
  echo "Base packages installed successfully."
  read -p "Do you want to install work-specific packages from ./packages/bundle.work? (y/N): " install_work_deps

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

Step 3: Stow configuration files from ./home to ~
echo "Step 3: Stowing configuration files"
# Ensure stow is available (it should be from the Brewfile)
if command_exists stow; then
  echo "Running stow..."
  # Stow files from ./home into the HOME directory
  # -R: Re-stow, overwriting existing links if necessary
  # -v: Verbose output
  # -d .: Specifies the directory containing the package directories (stow dir)
  # -t $HOME: Specifies the target directory
  # home: The package directory within '.' to stow
  # We need to be in the parent directory of '.' for stow -d . to work correctly
  # Assuming the script is run from the root of the repo where '.' is located.
  if stow -R -v -d . -t "$HOME" home; then
    echo "Stow completed successfully."
  else
    echo "Stow command failed. Please check the output above."
    # Decide if this should be fatal. Let's allow continuation for now.
    echo "Continuing initialization despite stow failure."
  fi
else
  echo "Stow command not found. Skipping stow step."
  echo "Please ensure stow was installed correctly in Step 2."
fi

# Step 4: Install Bun
echo "Step 4: Installing Bun"
if ! command_exists bun; then
  echo "Installing Bun..." && curl -fsSL https://bun.sh/install | bash;
  else echo "Bun already installed.";
fi

# Step 5: Generate GitHub SSH Key
# echo "Step 5: Generating a new SSH key for GitHub"
# echo "This key will be saved to ~/.ssh/id_ed25519_github"
# echo "You will be prompted to enter a passphrase for the key."
# echo "It is recommended to use a strong passphrase."
#
# # Define the key path
# github_key_path="$HOME/.ssh/id_ed25519_github"
#
# # Check if the key already exists
# if [ -f "$github_key_path" ]; then
#   echo "SSH key $github_key_path already exists. Skipping generation."
# else
#   # Create the .ssh directory if it doesn't exist
#   mkdir -p "$HOME/.ssh"
#   chmod 700 "$HOME/.ssh"
#
#   # Generate the SSH key
#   ssh-keygen -t ed25519 -C "dillon.mulroy@gmail.com" -f "$github_key_path"
#
#   if [ $? -eq 0 ]; then
#     echo "SSH key generated successfully!"
#     echo "Please add the public key ($github_key_path.pub) to your GitHub account."
#     echo "You can copy the public key using:"
#     echo "pbcopy < $github_key_path.pub"
#     echo "Then go to GitHub > Settings > SSH and GPG keys > New SSH key."
#   else
#     echo "SSH key generation failed. Please check the output above."
#     # Decide if this should be a fatal error or not. Let's allow continuation.
#     echo "Continuing initialization despite SSH key generation failure."
#   fi
# fi
#
#
# # Step 6: Install MonoLisa Font
# echo "Step 6: Installing MonoLisa Font"
#
# # Check if the key file exists before prompting
# if [ ! -f "$github_key_path" ]; then
#   echo "GitHub SSH key ($github_key_path) not found. Skipping font installation."
#   echo "Please ensure Step 5 (SSH Key Generation) completed successfully or create the key manually."
# else
#   read -p "Have you added the SSH public key ($github_key_path.pub) to your GitHub account? (y/N): " key_added_to_github
#
#   if [[ "$key_added_to_github" =~ ^[Yy]$ ]]; then
#     echo "Attempting to clone the MonoLisa font repository..."
#     font_repo_url="git@github.com:dmmulroy/mono-lisa.git"
#     # Use a temporary directory for cloning
#     font_temp_dir=$(mktemp -d)
#
#     # Clone using the specific SSH key
#     if GIT_SSH_COMMAND="ssh -i $github_key_path -o IdentitiesOnly=yes" git clone "$font_repo_url" "$font_temp_dir"; then
#       echo "Repository cloned successfully."
#
#       # Define the macOS font directory
#       font_install_dir="$HOME/Library/Fonts"
#       mkdir -p "$font_install_dir" # Ensure the directory exists
#
#       echo "Installing font files to $font_install_dir..."
#       # Find and copy font files (adjust pattern if needed, e.g., *.ttf)
#       find "$font_temp_dir" -name '*.otf' -exec cp {} "$font_install_dir/" \;
#
#       if [ $? -eq 0 ]; then
#         echo "MonoLisa font files installed successfully."
#         echo "You may need to restart applications or log out/in for the font to be available everywhere."
#       else
#         echo "Failed to copy font files. Please check permissions for $font_install_dir."
#       fi
#
#       # Clean up the temporary directory
#       echo "Cleaning up temporary directory..."
#       rm -rf "$font_temp_dir"
#     else
#       echo "Failed to clone the font repository. Please ensure:"
#       echo "1. The SSH key ($github_key_path) is correct and has been added to GitHub."
#       echo "2. You have access permissions to the repository: $font_repo_url"
#       echo "3. Git is installed and configured correctly."
#       # Clean up the potentially partially created temp directory
#       rm -rf "$font_temp_dir"
#       echo "Skipping font installation due to clone failure."
#     fi
#   else
#     echo "Skipping MonoLisa font installation because the SSH key was not confirmed to be added to GitHub."
#   fi
# fi

# Step 7: Set fish as the default and login shell

echo "Step 7: Setting fish as the default and login shell"

# Check if fish is installed
if command_exists fish; then
  echo "Fish shell is installed."

  # Get the path to the fish binary
  fish_path=$(command -v fish)

  # Check if fish is already in /etc/shells
  if ! grep -q "$fish_path" /etc/shells; then
    echo "Adding $fish_path to /etc/shells"
    echo "$fish_path" | sudo tee -a /etc/shells
  else
    echo "Fish shell is already listed in /etc/shells."
  fi

  # Set fish as the default shell for the current user
  if [ "$SHELL" != "$fish_path" ]; then
    echo "Changing the default shell to fish for user $USER"
    chsh -s "$fish_path"
    echo "Default shell changed to fish. Please log out and log back in for changes to take effect."
  else
    echo "Fish is already the default shell."
  fi

  # Install jhillyerd/plugin-git using fisher
  echo "Installing jhillyerd/plugin-git with fisher"
  fish -c "fisher install jhillyerd/plugin-git"
else
  echo "Fish shell is not installed. Please install it first using your package manager."
fi



echo "Initialization complete!"

exit 0
