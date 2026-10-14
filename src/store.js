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
      // These released errors occurred before the send control was clicked. Preserve
      // that fact when upgrading so the user's stopped receipts can resume.
      if (
        job.sendAttempted === undefined &&
        [
          "The shared conversation did not finish loading.",
          "The shared chat has no editable composer. Inspect the destination tab.",
          "The destination editor already contains text. Inspect it before continuing.",
          "The receipt message could not be entered exactly. No message was sent.",
          "ChatGPT has multiple editable message boxes. Inspect the destination tab before sending.",
        ].includes(job.error)
      ) {
        job.sendAttempted = false;
        if (job.status === "needs-review") job.status = "failed";
      }
      if (["opening", "sending", "verifying"].includes(job.status)) {
        job.status = job.sendAttempted === false ? "failed" : "needs-review";
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
