#!/bin/sh
# Build the store zip from src/, named like the release workflow's artifact.
set -e
cd "$(dirname "$0")"
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' src/manifest.json)
out="watch-history-for-netflix-v$version.zip"
rm -f "$out"
(cd src && zip -rq "../$out" . -x '*.DS_Store')
echo "$out"
