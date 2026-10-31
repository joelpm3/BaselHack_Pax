#!/usr/bin/env sh
# index.html is the artifact source (the publisher adds the document skeleton); present.html is the
# same deck with a skeleton, for presenting offline from this folder.
cd "$(dirname "$0")"
{ printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'; cat index.html; printf '\n</body></html>\n'; } > present.html
