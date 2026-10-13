import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = path.join(root, "dist");
const manifest = JSON.parse(
  await readFile(path.join(root, "manifest.json"), "utf8"),
);
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (manifest.version !== pkg.version)
  throw new Error("Manifest and package versions differ.");
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
for (const entry of [
  "manifest.json",
  "src",
  "public",
  "docs/screenshots",
  "LICENSE",
  "README.md",
  "README.zh-CN.md",
  "THIRD_PARTY_NOTICES.md",
])
  await cp(path.join(root, entry), path.join(directory, entry), {
    recursive: true,
  });
console.log(
  `ChatPort ${manifest.version} is built: ${directory}\nLoad this folder in Chrome's Extensions page. No server or Node.js is needed to use the release ZIP.`,
);
