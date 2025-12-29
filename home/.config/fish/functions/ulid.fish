function ulid -d "Generate a ULID (Universally Unique Lexicographically Sortable Identifier)"
  # ULID format: 26 characters (10 timestamp + 16 random)
  # Crockford's Base32 alphabet (excluding I, L, O, U to avoid confusion)
  set -l alphabet "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

  # Get timestamp in ms and generate ULID via python (avoids fish math float issues)
  if command -v python3 &>/dev/null
    python3 -c "
import time, random
alphabet = '$alphabet'
t = int(time.time() * 1000)
ts = ''.join(alphabet[(t >> (45 - 5*i)) & 31] for i in range(10))
rnd = ''.join(random.choice(alphabet) for _ in range(16))
print(ts + rnd)
"
    return 0
  end

  echo "Error: python3 required for ULID generation"
  return 1
end
