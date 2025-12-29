function uuid -d "Generate a UUID"
  # Try uuidgen first (available on macOS and many Linux systems)
  if command -v uuidgen &>/dev/null
    uuidgen | tr '[:upper:]' '[:lower:]'
    return 0
  end

  # Try Python as fallback
  if command -v python3 &>/dev/null
    python3 -c "import uuid; print(uuid.uuid4())"
    return 0
  end

  # Try node as fallback
  if command -v node &>/dev/null
    node -e "console.log(require('crypto').randomUUID())"
    return 0
  end

  echo "Error: No UUID generator available (tried uuidgen, python3, node)"
  return 1
end
