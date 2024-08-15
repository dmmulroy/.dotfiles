#!/bin/bash

popup() {
LOCK=/tmp/tmux-popups-lock
# glitchcat ~/.current_cow --duration infinite --glitchness 30 --amount 30


function decolor() {
  if [[ "$1" == "force" ]]; then
    sed 's/\x1B\[[0-9;]\{1,\}[A-Za-z]//g'
  elif [[ "$EFFECT" == *"termsand"* ]]; then
    cat
  elif [[ -n "$EFFECT" ]]; then
    sed 's/\x1B\[[0-9;]\{1,\}[A-Za-z]//g'
  else
    cat
  fi
}

# handle effects
if [[ "$1" == "-e" ]]; then
  shift
  EFFECT="$1"
  shift
  case "$EFFECT" in
    sand)
      export EFFECT="| /Users/dmmulroy/.cargo/bin/termsand"
      ;;
    glitch)
      export EFFECT="| glitchcat --duration infinite --glitchness 30 --amount 30"
      ;;
    *)
      export EFFECT="| python3 -m terminaltexteffects $EFFECT"
      ;;
  esac
fi
if [[ ! -p /dev/stdin ]]; then
  flock $LOCK /bin/sh -c "tmux display-popup $*"
else
  TMP="$(mktemp)"
  trap "rm $TMP" EXIT
  HEIGHT=1
  WIDTH=10
  decolor > "$TMP"
  while IFS= read -r line; do
    if [[ ${#line} -gt $WIDTH ]]; then
      WIDTH=${#line}
    fi
    ((HEIGHT++))
  done < <(decolor force < "$TMP")
  ((HEIGHT+=2))
  ((WIDTH+=2))

  MAX=$(tmux display -p '#{window_width}x#{window_height}')
  MAX_H=${MAX#*x}
  ((MAX_H+=1))
  MAX_W=${MAX%x*}
  if [[ $HEIGHT -gt $MAX_H ]]; then
    HEIGHT=$MAX_H
  fi
  if [[ $WIDTH -gt $MAX_W ]]; then
    WIDTH=$MAX_W
  fi
  EFFECT="${EFFECT:-; tput civis}"
  flock $LOCK /bin/sh -c "cd $PWD; tmux display-popup -w $WIDTH -h $HEIGHT $* 'cd $PWD; cat \"$TMP\" $EFFECT'"
fi
}


PANE=$(tmux display -p "#{pane_id}")
DIMENSIONS="$(tmux display -p "#{pane_width}x#{pane_height}")"
POSITION="$(tmux display -p "#{pane_left}x#{pane_top}")"
HEIGHT="${DIMENSIONS#*x}"
WIDTH="${DIMENSIONS%x*}"
Y="${POSITION#*x}"
((Y+=HEIGHT+1))
X="${POSITION%x*}"
STUFF="$(tmux capture-pane -p -e -t "$PANE")"
echo -e "$STUFF" \
  | popup -e $1 -E -B -y$Y -x$X -w $WIDTH -h $HEIGHT
