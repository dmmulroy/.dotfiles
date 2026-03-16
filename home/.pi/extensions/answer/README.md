# pi-extension-answer

Interactive Pi extension that extracts unanswered questions from the last completed assistant message and turns them into a guided answer flow.

## Install

```sh
pi install ~/.dotfiles/home/.pi/extensions/answer
```

## Commands

- `/answer`
- `/answer-config`

## Notes

- Uses configured extraction models to detect user-answerable questions.
- Loads from the local package path without copying the source tree.
