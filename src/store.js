import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

export class Store {
  constructor(directory) {
    this.directory = directory;
    this.jobs = [];
  }
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const data = JSON.parse(
        await readFile(path.join(this.directory, "progress.json"), "utf8"),
      );
      if (data.version !== 1 || !Array.isArray(data.jobs))
        throw new Error("Unsupported progress file.");
      this.jobs = data.jobs;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const job of this.jobs) {
      if (["opening", "sending", "verifying"].includes(job.status)) {
        job.status = "needs-review";
        job.error =
          "The previous run stopped during receipt. Check the destination before sending again.";
      } else if (job.status === "sharing") job.status = "pending";
    }
    await this.save();
  }
  async save() {
    const temporary = path.join(this.directory, "progress.json.tmp");
    await writeFile(
      temporary,
      JSON.stringify({ version: 1, jobs: this.jobs }, null, 2),
      { mode: 0o600 },
    );
    await rename(temporary, path.join(this.directory, "progress.json"));
  }
}
