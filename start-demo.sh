#!/usr/bin/env bash
cd "$(dirname "$0")/standalone"
python3 -m http.server 8080
