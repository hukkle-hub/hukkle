#!/usr/bin/env bash
set -euo pipefail
python3 "$(dirname "$0")/tools/rollback.py" "${1:?usage: $0 /path/to/hukkle}"
