#!/bin/sh
# Usage: ./make-sample.sh path/to/file.emb  -> writes sample.js (embedded base64 sample)
[ -f "$1" ] || { echo "usage: $0 file.emb" >&2; exit 1; }
printf 'window.SAMPLE_EMB = { name: "%s", base64: "%s" };\n' "$(basename "$1")" "$(base64 < "$1" | tr -d '\n')" > "$(dirname "$0")/sample.js"
