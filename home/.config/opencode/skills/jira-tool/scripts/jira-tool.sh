#!/usr/bin/env bash
set -euo pipefail

# Jira CLI for OpenCode agents
# Uses cloudflared for authentication

JIRA_BASE="https://jira.cfdata.org"
API_BASE="$JIRA_BASE/rest/api/latest"

# Check if token is valid (not expired)
token_valid() {
  local token="$1"
  [[ -z "$token" ]] && return 1
  
  # Decode JWT and check exp claim
  local payload exp now
  payload=$(echo "$token" | cut -d. -f2 | base64 -d 2>/dev/null) || return 1
  exp=$(echo "$payload" | grep -o '"exp":[0-9]*' | cut -d: -f2) || return 1
  now=$(date +%s)
  
  # Valid if exp > now (with 60s buffer)
  [[ -n "$exp" ]] && (( exp > now + 60 ))
}

# Get or refresh token, auto-login if needed
get_token() {
  local token
  token=$(cloudflared access token "$JIRA_BASE" 2>/dev/null || true)
  
  if token_valid "$token"; then
    echo "$token"
    return 0
  fi
  
  # Token missing or expired - need to login
  echo "Token expired or missing. Initiating login..." >&2
  
  # Check if we're in an interactive terminal
  if [[ -t 0 ]]; then
    # Interactive - run login directly
    cloudflared access login "$JIRA_BASE" >&2
  else
    # Non-interactive (agent/script) - try to open browser
    local login_url="$JIRA_BASE/cdn-cgi/access/cli"
    echo "Opening browser for authentication..." >&2
    
    # Start login in background, capture output
    local tmp_out
    tmp_out=$(mktemp)
    cloudflared access login "$JIRA_BASE" > "$tmp_out" 2>&1 &
    local login_pid=$!
    
    # Wait a moment for URL to be generated
    sleep 2
    
    # Try to open browser with the URL
    if [[ -f "$tmp_out" ]]; then
      local url
      url=$(grep -o 'https://[^ ]*' "$tmp_out" | head -1 || true)
      if [[ -n "$url" ]]; then
        # Try various openers
        if command -v open &>/dev/null; then
          open "$url" 2>/dev/null || true
        elif command -v xdg-open &>/dev/null; then
          xdg-open "$url" 2>/dev/null || true
        fi
        echo "Waiting for browser authentication..." >&2
        echo "URL: $url" >&2
      fi
    fi
    
    # Wait for login to complete (timeout 120s)
    local waited=0
    while kill -0 "$login_pid" 2>/dev/null && (( waited < 120 )); do
      sleep 2
      waited=$((waited + 2))
    done
    
    rm -f "$tmp_out"
    
    # Check if login succeeded
    if kill -0 "$login_pid" 2>/dev/null; then
      kill "$login_pid" 2>/dev/null || true
      echo "Login timed out" >&2
      exit 1
    fi
  fi
  
  # Get the new token
  token=$(cloudflared access token "$JIRA_BASE" 2>/dev/null || true)
  if [[ -z "$token" ]]; then
    echo "Failed to obtain token after login" >&2
    exit 1
  fi
  
  echo "$token"
}

# Make authenticated request
jira_request() {
  local method="$1" endpoint="$2" data="${3:-}"
  local token
  token=$(get_token)
  
  local args=(-s -X "$method" "$API_BASE$endpoint" -H "cf-access-token: $token" -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(-d "$data")
  
  curl "${args[@]}"
}

# Commands
cmd_create() {
  local project="" summary="" type="Task" description="" labels="" priority="" assignee="" parent="" epic=""
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -p|--project) project="$2"; shift 2 ;;
      -s|--summary) summary="$2"; shift 2 ;;
      -t|--type) type="$2"; shift 2 ;;
      -d|--description) description="$2"; shift 2 ;;
      -l|--labels) labels="$2"; shift 2 ;;
      --priority) priority="$2"; shift 2 ;;
      -a|--assignee) assignee="$2"; shift 2 ;;
      --parent) parent="$2"; shift 2 ;;
      --epic) epic="$2"; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done
  
  [[ -z "$project" ]] && { echo "Error: --project required" >&2; exit 1; }
  [[ -z "$summary" ]] && { echo "Error: --summary required" >&2; exit 1; }
  
  # Escape description for JSON (handle newlines, quotes, backslashes)
  if [[ -n "$description" ]]; then
    description=$(printf '%s' "$description" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])')
  fi
  
  local fields="{\"project\":{\"key\":\"$project\"},\"summary\":\"$summary\",\"issuetype\":{\"name\":\"$type\"}"
  [[ -n "$description" ]] && fields+=",\"description\":\"$description\""
  [[ -n "$priority" ]] && fields+=",\"priority\":{\"name\":\"$priority\"}"
  [[ -n "$assignee" ]] && fields+=",\"assignee\":{\"name\":\"$assignee\"}"
  [[ -n "$parent" ]] && fields+=",\"parent\":{\"key\":\"$parent\"}"
  # Epic link field varies by Jira instance - customfield_10014 is common
  [[ -n "$epic" ]] && fields+=",\"customfield_10014\":\"$epic\""
  if [[ -n "$labels" ]]; then
    local label_arr
    label_arr=$(echo "$labels" | tr ',' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
    fields+=",\"labels\":[$label_arr]"
  fi
  fields+="}"
  
  jira_request POST "/issue" "{\"fields\":$fields}"
}

cmd_get() {
  local issue="$1"
  [[ -z "$issue" ]] && { echo "Usage: jira get <ISSUE-KEY>" >&2; exit 1; }
  jira_request GET "/issue/$issue?fields=summary,status,assignee,priority,description,labels,created,updated"
}

cmd_update() {
  local issue="" summary="" description="" labels="" priority="" assignee=""
  
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -i|--issue) issue="$2"; shift 2 ;;
      -s|--summary) summary="$2"; shift 2 ;;
      -d|--description) description="$2"; shift 2 ;;
      -l|--labels) labels="$2"; shift 2 ;;
      --priority) priority="$2"; shift 2 ;;
      -a|--assignee) assignee="$2"; shift 2 ;;
      *) 
        [[ -z "$issue" ]] && { issue="$1"; shift; continue; }
        echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done
  
  [[ -z "$issue" ]] && { echo "Error: issue key required" >&2; exit 1; }
  
  local fields="{"
  local first=true
  add_field() {
    $first || fields+=","
    fields+="$1"
    first=false
  }
  
  [[ -n "$summary" ]] && add_field "\"summary\":\"$summary\""
  [[ -n "$description" ]] && add_field "\"description\":\"$description\""
  [[ -n "$priority" ]] && add_field "\"priority\":{\"name\":\"$priority\"}"
  [[ -n "$assignee" ]] && add_field "\"assignee\":{\"name\":\"$assignee\"}"
  if [[ -n "$labels" ]]; then
    local label_arr
    label_arr=$(echo "$labels" | tr ',' '\n' | sed 's/.*/"&"/' | tr '\n' ',' | sed 's/,$//')
    add_field "\"labels\":[$label_arr]"
  fi
  fields+="}"
  
  [[ "$fields" == "{}" ]] && { echo "Error: no fields to update" >&2; exit 1; }
  
  jira_request PUT "/issue/$issue" "{\"fields\":$fields}"
  echo "Updated $issue"
}

cmd_comment() {
  local issue="$1" body="$2"
  [[ -z "$issue" || -z "$body" ]] && { echo "Usage: jira comment <ISSUE-KEY> <BODY>" >&2; exit 1; }
  jira_request POST "/issue/$issue/comment" "{\"body\":\"$body\"}"
}

cmd_transition() {
  local issue="$1" target="${2:-}"
  [[ -z "$issue" ]] && { echo "Usage: jira transition <ISSUE-KEY> [STATUS]" >&2; exit 1; }
  
  # Get available transitions
  local transitions
  transitions=$(jira_request GET "/issue/$issue/transitions")
  
  if [[ -z "$target" ]]; then
    echo "Available transitions for $issue:"
    echo "$transitions" | jq -r '.transitions[] | "  \(.id): \(.name)"'
    return
  fi
  
  # Find transition by name (case-insensitive)
  local tid
  tid=$(echo "$transitions" | jq -r --arg t "$target" '.transitions[] | select(.name | ascii_downcase == ($t | ascii_downcase)) | .id' | head -1)
  
  if [[ -z "$tid" ]]; then
    # Try by ID
    tid=$(echo "$transitions" | jq -r --arg t "$target" '.transitions[] | select(.id == $t) | .id' | head -1)
  fi
  
  [[ -z "$tid" ]] && { echo "Transition '$target' not found" >&2; exit 1; }
  
  jira_request POST "/issue/$issue/transitions" "{\"transition\":{\"id\":\"$tid\"}}"
  echo "Transitioned $issue to $target"
}

cmd_close() {
  local issue="$1"
  [[ -z "$issue" ]] && { echo "Usage: jira close <ISSUE-KEY>" >&2; exit 1; }
  
  # Get available transitions once
  local transitions
  transitions=$(jira_request GET "/issue/$issue/transitions")
  
  # Try common close transition names (case-insensitive match)
  for status in "Done" "Closed" "Resolved" "Complete"; do
    local tid
    tid=$(echo "$transitions" | jq -r --arg t "$status" '.transitions[] | select(.name | ascii_downcase == ($t | ascii_downcase)) | .id' | head -1)
    
    if [[ -n "$tid" ]]; then
      jira_request POST "/issue/$issue/transitions" "{\"transition\":{\"id\":\"$tid\"}}"
      echo "Closed $issue (transitioned to $status)"
      return 0
    fi
  done
  
  echo "Could not find close transition. Available:" >&2
  echo "$transitions" | jq -r '.transitions[] | "  \(.id): \(.name)"' >&2
  exit 1
}

cmd_delete() {
  local issue="$1"
  [[ -z "$issue" ]] && { echo "Usage: jira delete <ISSUE-KEY>" >&2; exit 1; }
  jira_request DELETE "/issue/$issue"
  echo "Deleted $issue"
}

cmd_assign() {
  local issue="$1" assignee="${2:--1}"
  [[ -z "$issue" ]] && { echo "Usage: jira assign <ISSUE-KEY> [USERNAME|-1 for unassign]" >&2; exit 1; }
  
  if [[ "$assignee" == "-1" ]]; then
    jira_request PUT "/issue/$issue/assignee" "{\"name\":null}"
    echo "Unassigned $issue"
  else
    jira_request PUT "/issue/$issue/assignee" "{\"name\":\"$assignee\"}"
    echo "Assigned $issue to $assignee"
  fi
}

cmd_search() {
  local jql="$1" max="${2:-20}"
  [[ -z "$jql" ]] && { echo "Usage: jira search <JQL> [max_results]" >&2; exit 1; }
  
  local encoded
  encoded=$(printf '%s' "$jql" | python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.stdin.read()))')
  jira_request GET "/search?jql=$encoded&maxResults=$max&fields=key,summary,status,assignee,priority"
}

cmd_login() {
  echo "Initiating Jira authentication..." >&2
  cloudflared access login "$JIRA_BASE"
  echo "Login successful." >&2
}

cmd_status() {
  local token
  token=$(cloudflared access token "$JIRA_BASE" 2>/dev/null || true)
  
  if [[ -z "$token" ]]; then
    echo "Status: Not authenticated"
    echo "Run: jira login"
    return 1
  fi
  
  if token_valid "$token"; then
    # Extract expiration
    local payload exp now remaining
    payload=$(echo "$token" | cut -d. -f2 | base64 -d 2>/dev/null)
    exp=$(echo "$payload" | grep -o '"exp":[0-9]*' | cut -d: -f2)
    now=$(date +%s)
    remaining=$(( (exp - now) / 60 ))
    
    local email
    email=$(echo "$payload" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
    
    echo "Status: Authenticated"
    echo "User: $email"
    echo "Expires in: ${remaining} minutes"
  else
    echo "Status: Token expired"
    echo "Run: jira login"
    return 1
  fi
}

cmd_help() {
  cat <<EOF
Jira CLI for OpenCode agents

Usage: jira <command> [options]

Commands:
  create    Create a new issue
            -p|--project PROJECT  (required)
            -s|--summary TEXT     (required)
            -t|--type TYPE        (default: Task)
            -d|--description TEXT
            -l|--labels L1,L2
            --priority PRIORITY
            -a|--assignee USER
            --parent ISSUE-KEY    (for Sub-task type)
            --epic ISSUE-KEY      (link to epic)

  get       Get issue details
            jira get <ISSUE-KEY>

  update    Update an issue
            jira update <ISSUE-KEY> [options]
            Options same as create (except --project/--type)

  comment   Add a comment
            jira comment <ISSUE-KEY> <BODY>

  transition  Change issue status
            jira transition <ISSUE-KEY> [STATUS]
            (omit status to list available transitions)

  close     Close/complete an issue
            jira close <ISSUE-KEY>

  assign    Assign issue to user
            jira assign <ISSUE-KEY> [USERNAME]
            (omit username or use -1 to unassign)

  delete    Delete an issue
            jira delete <ISSUE-KEY>

  search    Search issues with JQL
            jira search <JQL> [max_results]

  login     Manually authenticate (opens browser)

  status    Show authentication status

Examples:
  jira create -p DEVTOOLS -s "Fix bug" -t Bug -l "urgent,backend"
  jira get DEVTOOLS-123
  jira update DEVTOOLS-123 -s "New title" -a myuser
  jira comment DEVTOOLS-123 "Fixed in commit abc123"
  jira transition DEVTOOLS-123 "In Progress"
  jira close DEVTOOLS-123
  jira search "project = DEVTOOLS AND status = Open" 50

Auth:
  Automatic - opens browser when token expired/missing.
  Token valid for 24h. Requires: cloudflared
EOF
}

# Main
case "${1:-help}" in
  create) shift; cmd_create "$@" ;;
  get) shift; cmd_get "$@" ;;
  update) shift; cmd_update "$@" ;;
  comment) shift; cmd_comment "$@" ;;
  transition) shift; cmd_transition "$@" ;;
  close) shift; cmd_close "$@" ;;
  delete) shift; cmd_delete "$@" ;;
  assign) shift; cmd_assign "$@" ;;
  search) shift; cmd_search "$@" ;;
  login|auth) cmd_login ;;
  status|whoami) cmd_status ;;
  help|--help|-h) cmd_help ;;
  *) echo "Unknown command: $1" >&2; cmd_help; exit 1 ;;
esac
