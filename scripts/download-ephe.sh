#!/bin/sh
set -e
EPHE_DIR="${1:-./ephe}"
mkdir -p "$EPHE_DIR"
BASE_URL="https://raw.githubusercontent.com/aloistr/swisseph/master/ephe"
for FILE in sepl_18.se1 semo_18.se1 seas_18.se1 \
            sepl_24.se1 semo_24.se1 seas_24.se1; do
  if [ ! -f "$EPHE_DIR/$FILE" ]; then
    echo "Downloading $FILE..."
    curl -fsSL "$BASE_URL/$FILE" -o "$EPHE_DIR/$FILE"
  else
    echo "Skipping $FILE (already exists)"
  fi
done
echo "Ephemeris files downloaded to $EPHE_DIR"
