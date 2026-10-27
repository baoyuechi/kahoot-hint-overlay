#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dist="$root/dist"
mode="${1:-release}"

read_meta() {
  node -e '
    const fs = require("fs");
    const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const slug = String(m.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    process.stdout.write(`${m.version} ${slug}`);
  ' "$root/manifest.chrome.json"
}

read -r version slug <<<"$(read_meta)"
echo "building ${slug} ${version} (${mode})"

rm -rf "$dist"
mkdir -p "$dist"

stage() {
  local target="$1"
  local manifest="$2"
  local out="$dist/$target"
  mkdir -p "$out"
  cp -R "$root/src" "$out/src"
  cp "$manifest" "$out/manifest.json"
}

stage firefox "$root/manifest.firefox.json"
stage chrome "$root/manifest.chrome.json"

if [[ "$mode" == "dev" ]]; then
  # 开发用：把 mock 页所在的本地源加入 matches，便于在 localhost 上验证帧管道
  stage dev "$root/manifest.chrome.json"
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const cs of m.content_scripts) {
      cs.matches.push("http://localhost:8000/*", "http://127.0.0.1:8000/*");
    }
    for (const war of m.web_accessible_resources || []) {
      war.matches.push("http://localhost:8000/*", "http://127.0.0.1:8000/*");
    }
    fs.writeFileSync(p, JSON.stringify(m, null, 2));
  ' "$dist/dev/manifest.json"
fi

archive() {
  local target="$1"
  local file="$dist/${slug}-${target}-${version}.zip"
  (cd "$dist/$target" && zip -q -r "$file" manifest.json src -x '*.DS_Store')
  echo "built $(basename "$file")"
}

archive firefox
archive chrome
[[ "$mode" == "dev" ]] && archive dev

echo "done: $dist"
