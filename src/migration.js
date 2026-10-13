import { snapshotOf } from "./proof.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Migration {
  constructor(store, chatgpt, { verificationDelays = [0, 2000, 5000] } = {}) {
    this.store = store;
    this.chatgpt = chatgpt;
    this.verificationDelays = verificationDelays;
    this.running = false;
    this.pauseRequested = false;
    this.current = null;
  }
  async accounts() {
    const source = await this.chatgpt.identity("source");
    const target = await this.chatgpt.identity("target");
    if (source.id === target.id)
      throw new Error("The source and destination must be different accounts.");
    return { source, target };
  }
  async assertAccounts(pair) {
    const current = await this.accounts();
    if (
      current.source.id !== pair.source.id ||
      current.target.id !== pair.target.id
    ) {
      throw new Error(
        "An account changed during this run. Restore the original accounts before resuming.",
      );
    }
  }
  async start(ids, catalog, options = {}, expectedAccounts) {
    if (this.running)
      throw new Error("A migration or check is already running.");
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length)
      throw new Error("Select distinct conversations first.");
    const selected = ids.map((id) => catalog.find((item) => item.id === id));
    if (selected.some((item) => !item))
      throw new Error(
        "A selected conversation is no longer in the loaded catalog.",
      );
    const seconds = options.delaySeconds ?? 8;
    if (!Number.isFinite(seconds) || seconds < 3 || seconds > 300)
      throw new Error("Delay must be between 3 and 300 seconds.");
    const message =
      options.message?.trim() || "Migrated to my new account. Please reply OK.";
    if (message.length > 1000)
      throw new Error("The migration message is too long.");
    // Acquire the run before any async call, so concurrent starts cannot both pass.
    this.running = true;
    this.pauseRequested = false;
    try {
      const pair = await this.accounts();
      if (
        expectedAccounts &&
        (pair.source.id !== expectedAccounts.source?.id ||
          pair.target.id !== expectedAccounts.target?.id)
      ) {
        throw new Error(
          "The connected accounts changed. Check the accounts and reload the catalog before migrating.",
        );
      }
      const jobs = [];
      for (const item of selected) {
        let job = this.store.jobs.find(
          (j) =>
            j.sourceAccount === pair.source.id &&
            j.targetAccount === pair.target.id &&
            j.sourceId === item.id,
        );
        if (!job) {
          const id = crypto.randomUUID();
          job = {
            id,
            sourceId: item.id,
            title: item.title,
            sourceAccount: pair.source.id,
            targetAccount: pair.target.id,
            status: "pending",
            createdAt: new Date().toISOString(),
            marker: `${message}\n[ChatPort:${id}]`,
          };
          this.store.jobs.push(job);
        }
        if (["pending", "failed"].includes(job.status)) jobs.push(job);
      }
      await this.store.save();
      this.task = this.run(jobs, pair, seconds * 1000).finally(() => {
        this.running = false;
        this.current = null;
      });
      // run() handles job failures; a storage failure must also be reported.
      this.task.catch((error) => {
        this.error = error.message;
      });
    } catch (error) {
      this.running = false;
      throw error;
    }
  }
  async update(job, fields) {
    Object.assign(job, fields);
    await this.store.save();
  }
  async verified(job) {
    let result;
    for (const wait of this.verificationDelays) {
      if (wait) await delay(wait);
      await this.assertAccounts({
        source: { id: job.sourceAccount },
        target: { id: job.targetAccount },
      });
      result = await this.chatgpt.verify(job);
      if (result.verified) return result;
    }
    return result;
  }
  async run(jobs, pair, delayMs) {
    this.error = null;
    for (const [index, job] of jobs.entries()) {
      if (this.pauseRequested) break;
      this.current = job.sourceId;
      let claimStarted = false;
      try {
        await this.assertAccounts(pair);
        if (!job.shareUrl) {
          await this.update(job, { status: "sharing", error: null });
          const source = await this.chatgpt.conversation(
            "source",
            job.sourceId,
          );
          const snapshot = await snapshotOf(source);
          const shareUrl = await this.chatgpt.share(
            job.sourceId,
            source.current_node,
            job.title,
          );
          await this.update(job, { snapshot, shareUrl });
        }
        await this.assertAccounts(pair);
        await this.update(job, { status: "opening", error: null });
        claimStarted = true;
        await this.chatgpt.claim(job, async (targetId) =>
          this.update(job, { targetId, status: "verifying" }),
        );
        await this.update(job, { status: "verifying" });
        const proof = await this.verified(job);
        if (!proof.verified) throw new Error(proof.reason);
        await this.update(job, { status: "verified", proof, error: null });
      } catch (error) {
        await this.update(job, {
          status: claimStarted ? "needs-review" : "failed",
          error: error.message,
        });
        this.error = error.message;
        break;
      }
      if (index < jobs.length - 1 && !this.pauseRequested) {
        // Pause is responsive during the delay and takes effect after the current copy finishes.
        for (
          let waited = 0;
          waited < delayMs && !this.pauseRequested;
          waited += 250
        )
          await delay(250);
      }
    }
  }
  pause() {
    this.pauseRequested = true;
  }
  async recheck(id, targetId) {
    if (this.running)
      throw new Error(
        "Pause and wait for the current operation to finish first.",
      );
    const job = this.store.jobs.find((item) => item.id === id);
    if (!job || job.status !== "needs-review" || !job.snapshot)
      throw new Error("No uncertain migration to check.");
    this.running = true;
    try {
      await this.assertAccounts({
        source: { id: job.sourceAccount },
        target: { id: job.targetAccount },
      });
      const recovered = targetId || (await this.chatgpt.recover(job));
      if (!recovered)
        throw new Error(
          "No saved migration marker was found. Inspect the target browser; do not resend automatically.",
        );
      await this.update(job, { targetId: recovered });
      const proof = await this.verified(job);
      if (!proof.verified) throw new Error(proof.reason);
      await this.update(job, { status: "verified", proof, error: null });
    } catch (error) {
      await this.update(job, { error: error.message });
      throw error;
    } finally {
      this.running = false;
    }
  }
}
