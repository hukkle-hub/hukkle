#!/usr/bin/env bash
set -euo pipefail
python3 "$(dirname "$0")/tools/apply_to_repo.py" "${1:?usage: $0 /path/to/hukkle}"
