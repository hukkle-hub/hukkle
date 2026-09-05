#!/usr/bin/env python3
"""Patch the existing Supabase Edge Function with server-driven update/status routes.

This script is intentionally idempotent and fails closed if the expected API
shape is not found. It never guesses around a changed server file.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import shutil
import sys
from datetime import datetime

BEGIN = "// HY_UPDATE_SYSTEM_BEGIN"
END = "// HY_UPDATE_SYSTEM_END"
ROUTE_BEGIN = "// HY_UPDATE_ROUTES_BEGIN"
ROUTE_END = "// HY_UPDATE_ROUTES_END"

CONFIG_BLOCK = r'''
// HY_UPDATE_SYSTEM_BEGIN
// Client/version policy is controlled through Edge Function secrets.
const HY_CLIENT_LATEST = Deno.env.get("HY_CLIENT_LATEST") ?? "38.0.0";
const HY_CLIENT_MIN = Deno.env.get("HY_CLIENT_MIN") ?? "37.0.0";
const HY_CONTENT_VERSION = Deno.env.get("HY_CONTENT_VERSION") ?? "2026.09.05.1";
const HY_API_VERSION = "1.1.0";
const HY_FORCE_UPDATE = (Deno.env.get("HY_FORCE_UPDATE") ?? "false").toLowerCase() === "true";
const HY_MAINTENANCE = (Deno.env.get("HY_MAINTENANCE") ?? "false").toLowerCase() === "true";
const HY_MAINTENANCE_MESSAGE = Deno.env.get("HY_MAINTENANCE_MESSAGE") ?? "";
const HY_UPDATE_URL = Deno.env.get("HY_UPDATE_URL") ?? "";
const HY_RELEASE_NOTES = (Deno.env.get("HY_RELEASE_NOTES") ?? "")
  .split("|").map((v) => v.trim()).filter(Boolean);

function versionTuple(value: string) {
  return String(value || "0").split(/[.+-]/).slice(0, 3)
    .map((v) => Number.parseInt(v, 10) || 0);
}
function versionLt(a: string, b: string) {
  const av = versionTuple(a), bv = versionTuple(b);
  for (let i = 0; i < 3; i++) {
    if (av[i] < bv[i]) return true;
    if (av[i] > bv[i]) return false;
  }
  return false;
}
function systemStatus() {
  return {
    ok: true,
    product: "흥양기",
    service: "hy",
    environment: Deno.env.get("DENO_DEPLOYMENT_ID") ? "production" : "local",
    server_time: new Date().toISOString(),
    api_version: HY_API_VERSION,
    content_version: HY_CONTENT_VERSION,
    client_latest: HY_CLIENT_LATEST,
    client_min: HY_CLIENT_MIN,
    force_update: HY_FORCE_UPDATE,
    maintenance: HY_MAINTENANCE,
    maintenance_message: HY_MAINTENANCE_MESSAGE,
    update_url: HY_UPDATE_URL,
    release_notes: HY_RELEASE_NOTES,
  };
}
// HY_UPDATE_SYSTEM_END
'''.strip()

ROUTE_BLOCK = r'''
  // HY_UPDATE_ROUTES_BEGIN
  // These routes intentionally run before master()/DB access, so live-ops can
  // distinguish an API process failure from a database/master-data failure.
  if (path === "/system/status" || path === "/health") return ok(systemStatus());

  const clientVersion = req.headers.get("x-client-version") ?? "";
  if (clientVersion && versionLt(clientVersion, HY_CLIENT_MIN)) {
    return err("CLIENT_UPDATE_REQUIRED", "새 클라이언트가 필요합니다.", {
      current_version: clientVersion,
      latest_version: HY_CLIENT_LATEST,
      min_supported_version: HY_CLIENT_MIN,
      update_url: HY_UPDATE_URL,
      force_update: true,
    }, 426);
  }
  if (HY_MAINTENANCE) {
    return err("MAINTENANCE", HY_MAINTENANCE_MESSAGE || "서버 점검 중입니다.", {
      maintenance: true,
      retry_after: 60,
    }, 503);
  }
  // HY_UPDATE_ROUTES_END
'''.rstrip()


def patch_text(text: str) -> str:
    if BEGIN in text and ROUTE_BEGIN in text:
        return text

    original = text

    # CORS header extension.
    old_header = '"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-player",'
    new_header = '"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-player, x-client-version",'
    if old_header in text:
        text = text.replace(old_header, new_header, 1)
    elif "x-client-version" not in text:
        raise RuntimeError("CORS header anchor not found; API source may have changed")

    # Configuration block before master cache.
    if BEGIN not in text:
        anchor = "// ── 마스터 캐시"
        pos = text.find(anchor)
        if pos < 0:
            raise RuntimeError("master-cache anchor not found; refusing unsafe patch")
        text = text[:pos] + CONFIG_BLOCK + "\n\n" + text[pos:]

    # Public health/status + compatibility guard before DB/master load.
    if ROUTE_BEGIN not in text:
        pattern = re.compile(
            r'(\s+const body = req\.method === "POST" \? await req\.json\(\)\.catch\(\(\) => \(\{\}\)\) : \{\};\s*\n\s*try \{\s*\n)(\s*const m = await master\(\);)',
            re.MULTILINE,
        )
        match = pattern.search(text)
        if not match:
            raise RuntimeError("request-body/master anchor not found; refusing unsafe patch")
        replacement = match.group(1) + "\n" + ROUTE_BLOCK + "\n\n" + match.group(2)
        text = text[:match.start()] + replacement + text[match.end():]

    if text == original:
        raise RuntimeError("no changes made")
    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("api_index", type=Path, help="path to api/index.ts")
    parser.add_argument("--no-backup", action="store_true")
    args = parser.parse_args()
    path = args.api_index.resolve()
    if not path.is_file():
        print(f"ERROR: missing {path}", file=sys.stderr)
        return 2

    source = path.read_text("utf-8")
    if BEGIN in source and ROUTE_BEGIN in source:
        print(f"already patched: {path}")
        return 0

    try:
        patched = patch_text(source)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 3

    if not args.no_backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = path.with_name(f"{path.name}.before-live-update-{stamp}.bak")
        shutil.copy2(path, backup)
        print(f"backup: {backup}")

    path.write_text(patched, "utf-8")
    print(f"patched: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
