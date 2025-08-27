// scripts/inject-version.mjs
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function git(cmd) {
  try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}

const base = pkg.version || "0.0.0";
const sha = git("git rev-parse --short HEAD") || "dev";
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`;

// 生成你想要的 beta 版本串
// 例：0.7.0-beta.20250826.2304+g1a2b3c
const APP_VERSION = `${base.replace(/\+.*$/, "")}-beta.${stamp}+g${sha}`;

// 输出到 app/_generated/version.ts（被前端直接 import）
const outDir = path.join(root, "app", "_generated");
const outFile = path.join(outDir, "version.ts");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `// auto-generated at build time
export const APP_VERSION = "${APP_VERSION}";
export const APP_COMMIT = "${sha}";
export const APP_BUILD_AT = "${now.toISOString()}";
`, "utf8");

console.log("[version] generated:", APP_VERSION);
