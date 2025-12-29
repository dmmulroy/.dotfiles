function ulid -d "Generate a ULID (Universally Unique Lexicographically Sortable Identifier)"
  # ULID format: 26 characters (10 timestamp + 16 random)
  # Crockford's Base32 alphabet (excluding I, L, O, U to avoid confusion)
  set -l alphabet "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
  
  # Get current timestamp in milliseconds
  set -l timestamp_ms (python3 -c "import time; print(int(time.time() * 1000))")
  
  # Encode timestamp (48 bits = 10 Base32 characters)
  set -l timestamp_part ""
  set -l ts $timestamp_ms
  for i in (seq 10)
    set -l idx (math "$ts % 32")
    set timestamp_part (string sub -s (math "$idx + 1") -l 1 $alphabet)$timestamp_part
    set ts (math "$ts / 32")
  end
  
  # Generate random part (80 bits = 16 Base32 characters)
  set -l random_part ""
  for i in (seq 16)
    set -l idx (random 0 31)
    set random_part "$random_part"(string sub -s (math "$idx + 1") -l 1 $alphabet)
  end
  
  echo "$timestamp_part$random_part"
end
