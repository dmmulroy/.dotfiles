# Install fisher if not already installed
if not functions -q fisher
    echo "Installing fisher..."
    brew install fisher
end

# List of plugins to ensure are installed
set -l plugins_to_install \
    jhillyerd/plugin-git \
    jethrokuan/z

# Check and install plugins if they are not listed by fisher
for plugin in $plugins_to_install
    if not fisher list | string match -q -- $plugin
        echo "Installing $plugin with fisher..."
        fisher install $plugin
    end
end

# Clean up the variable
set -e plugins_to_install
