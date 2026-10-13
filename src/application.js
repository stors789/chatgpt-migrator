import { Migration } from "./migration.js";
import { conversationIdFromUrl, messagesOf } from "./proof.js";

export function createApplication(store, chatgpt, options = {}) {
  const migration = new Migration(store, chatgpt, options);
  let catalog = [];
  let catalogLoaded = false;
  let accounts = { source: null, target: null };
  let loading = false;
  const snapshot = () => ({
    accounts,
    catalog,
    catalogLoaded,
    jobs: store.jobs.filter(
      (job) =>
        job.sourceAccount === accounts.source?.id &&
        job.targetAccount === accounts.target?.id,
    ),
    running: migration.running,
    loading,
    paused: migration.pauseRequested,
    current: migration.current,
    error: migration.error || null,
  });
  async function request(route, body = {}) {
    if (route === "state") return snapshot();
    if (route === "report")
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        jobs: snapshot().jobs,
      };
    if (route === "pause") {
      migration.pause();
      return snapshot();
    }
    if (loading || migration.running)
      throw new Error("Wait for the current operation to finish.");
    loading = true;
    try {
      switch (route) {
        case "open":
          if (!["source", "target"].includes(body.role))
            throw new Error("Unknown account role.");
          accounts[body.role] = null;
          if (body.role === "source") {
            catalog = [];
            catalogLoaded = false;
          }
          await chatgpt.open(body.role);
          break;
        case "accounts": {
          const previousSource = accounts.source?.id;
          accounts = { source: null, target: null };
          const errors = [];
          for (const role of ["source", "target"]) {
            try {
              accounts[role] = await chatgpt.identity(role);
            } catch (error) {
              errors.push(error);
            }
          }
          if (previousSource !== accounts.source?.id) {
            catalog = [];
            catalogLoaded = false;
          }
          if (
            accounts.source &&
            accounts.target &&
            accounts.source.id === accounts.target.id
          )
            throw new Error(
              "The source and destination must be different accounts.",
            );
          if (errors.length)
            throw Object.assign(
              new Error(errors.map((error) => error.message).join(" ")),
              { code: errors[0].code },
            );
          break;
        }
        case "catalog": {
          const source = await chatgpt.identity("source");
          if (source.id !== accounts.source?.id) {
            catalog = [];
            catalogLoaded = false;
            accounts.source = source;
          }
          catalog = await chatgpt.catalog();
          catalogLoaded = true;
          break;
        }
        case "preview": {
          const source = await chatgpt.identity("source");
          if (
            source.id !== accounts.source?.id ||
            !catalog.some((item) => item.id === body.id)
          )
            throw new Error(
              "Reload the source account catalog before previewing.",
            );
          const data = await chatgpt.conversation("source", body.id);
          return { title: data.title, messages: messagesOf(data) };
        }
        case "start":
          if (body.confirmSharing !== true)
            throw new Error(
              "Confirm that the selected conversations may be shared first.",
            );
          await migration.start(body.ids, catalog, body.options, accounts);
          break;
        case "destination": {
          const job = snapshot().jobs.find((job) => job.id === body.id);
          if (!job?.targetId)
            throw new Error("No destination copy has been recovered yet.");
          const target = await chatgpt.identity("target");
          if (target.id !== job.targetAccount)
            throw Object.assign(
              new Error(
                "Restore the destination account and check accounts before opening this copy.",
              ),
              { code: "SIGN_IN_REQUIRED" },
            );
          await chatgpt.openDestination(job.targetId);
          break;
        }
        case "retry":
        case "recheck": {
          if (!snapshot().jobs.some((job) => job.id === body.id))
            throw new Error(
              "Check the original account pair before recovering this receipt.",
            );
          const targetId = body.url
            ? conversationIdFromUrl(body.url)
            : undefined;
          if (body.url && !targetId)
            throw new Error(
              "Enter a ChatGPT conversation URL, not a shared link.",
            );
          if (route === "retry") await migration.retry(body.id, targetId);
          else await migration.recheck(body.id, targetId);
          break;
        }
        default:
          throw new Error("Unknown operation.");
      }
    } finally {
      loading = false;
    }
    return snapshot();
  }
  return { request, migration, snapshot };
}
