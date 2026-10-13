import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await check(filename);
    else if (filename.endsWith(".js")) {
      const result = spawnSync(process.execPath, ["--check", filename], {
        stdio: "inherit",
      });
      if (result.status !== 0) process.exitCode = 1;
    }
  }
}
for (const directory of ["src", "public", "test", "scripts"])
  await check(directory);
