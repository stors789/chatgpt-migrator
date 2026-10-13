export class Store {
  constructor(storage = globalThis.chrome.storage.local) {
    this.storage = storage;
    this.jobs = [];
  }
  async load() {
    await this.storage.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    const { progress } = await this.storage.get("progress");
    if (progress !== undefined) {
      if (progress?.version !== 1 || !Array.isArray(progress.jobs))
        throw new Error(
          "Unsupported progress data. Download a backup before changing extension storage.",
        );
      this.jobs = progress.jobs;
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
    await this.storage.set({ progress: { version: 1, jobs: this.jobs } });
  }
}
