#!/usr/bin/env bash
# Copy the working file from the parent Band/ folder into this repo as index.html.
# Run this before committing, so the deployed page matches what you tested locally.
set -e
cd "$(dirname "$0")"
cp rehearsal.html index.html
echo "index.html updated from rehearsal.html"
git --no-pager diff --stat index.html || true
