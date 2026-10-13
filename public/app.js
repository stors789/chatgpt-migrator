import { Store } from "../src/store.js";
import { ChatGPT } from "../src/chatgpt.js";
import { createApplication } from "../src/application.js";
import { translations } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const h = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let language =
  localStorage.getItem("chatport-language") ||
  (navigator.language.startsWith("zh") ? "zh" : "en");
if (!translations[language]) language = "en";
let state = {
  accounts: {},
  catalog: [],
  jobs: [],
  running: false,
  loading: false,
};
let selected = new Set();
let sourceKey = "";
let localBusy = true;
let application;
let previewId = null;
let previewData = null;
let receiptStamp = "";
let rowsMarkup;
let projectMarkup;
const t = (key, values = {}) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    translations[language][key] || translations.en[key] || key,
  );
const jobOf = (id) => state.jobs.find((job) => job.sourceId === id);
const millis = (value) =>
  typeof value === "number" ? value * 1000 : Date.parse(value);
const dateText = (value) =>
  Number.isFinite(millis(value))
    ? new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(millis(value))
    : "—";

function translate() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-t]").forEach((element) => {
    element.textContent = t(element.dataset.t);
  });
  document.querySelectorAll("[data-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.placeholder);
  });
  $("language").textContent = language === "zh" ? "English" : "中文";
  if (!$("message").value) $("message").value = t("defaultMessage");
}

function notice(text, error = false) {
  $("notice").textContent = text;
  $("notice").className = text ? (error ? "error" : "notice") : "";
  $("notice").setAttribute("role", error ? "alert" : "status");
}

async function api(route, body) {
  if (!application) throw new Error(t("extensionOnly"));
  return application.request(route, body);
}

async function refresh() {
  const next = await api("state");
  const key = next.accounts.source?.id || "";
  if (key !== sourceKey) {
    sourceKey = key;
    selected = new Set(
      JSON.parse(localStorage.getItem(`chatport-selection:${key}`) || "[]"),
    );
    $("preview").hidden = true;
    $("workspace").classList.remove("has-preview");
    previewId = null;
  }
  state = next;
  if (state.catalogLoaded)
    selected = new Set(
      [...selected].filter((id) =>
        state.catalog.some((item) => item.id === id),
      ),
    );
  render();
}

async function action(operation) {
  localBusy = true;
  render();
  notice(t("working"));
  try {
    await operation();
    await refresh();
  } catch (error) {
    notice(translations[language][error.code] || error.message, true);
    await refresh().catch(() => {});
  } finally {
    localBusy = false;
    render();
  }
}

function filtered() {
  const query = $("search").value.trim().toLocaleLowerCase();
  const from = $("from-date").value
    ? new Date(`${$("from-date").value}T00:00:00`).getTime()
    : -Infinity;
  const through = $("to-date").value
    ? new Date(`${$("to-date").value}T23:59:59.999`).getTime()
    : Infinity;
  return state.catalog.filter((item) => {
    const status = jobOf(item.id)?.status || "unmigrated";
    const filter = $("status").value;
    return (
      item.title.toLocaleLowerCase().includes(query) &&
      (!$("project").value ||
        ($("project").value === "none"
          ? !item.project
          : item.project === $("project").value)) &&
      (!filter ||
        (filter === "archived"
          ? item.archived
          : filter === "unmigrated"
            ? status !== "verified"
            : filter === status)) &&
      (!Number.isFinite(from) || millis(item.updatedAt) >= from) &&
      (!Number.isFinite(through) || millis(item.updatedAt) <= through)
    );
  });
}

function render() {
  const focused = document.activeElement;
  const focusData = focused?.dataset;
  const busy = state.running || state.loading || localBusy;
  const items = filtered();
  $("source-email").textContent =
    state.accounts.source?.email || t("notConnected");
  $("target-email").textContent =
    state.accounts.target?.email || t("notConnected");
  document
    .querySelectorAll("[data-open], #check-accounts, #load-catalog")
    .forEach((button) => {
      button.disabled = busy;
    });
  $("load-catalog").disabled ||= !state.accounts.source;
  const projects = [
    ...new Set(state.catalog.map((item) => item.project).filter(Boolean)),
  ];
  const projectOptions = `<option value="">${h(t("allProjects"))}</option><option value="none">${h(t("noProject"))}</option>${projects.map((id) => `<option value="${h(id)}">${h(state.catalog.find((item) => item.project === id)?.projectName || id)}</option>`).join("")}`;
  if (projectOptions !== projectMarkup) {
    const projectValue = $("project").value;
    $("project").innerHTML = projectOptions;
    $("project").value = projectValue;
    projectMarkup = projectOptions;
  }
  $("catalog-count").textContent = state.catalogLoaded
    ? t("loaded", { n: state.catalog.length })
    : t("catalogEmpty");
  $("visible-count").textContent = t("showing", { n: items.length });
  $("select-visible").checked =
    items.length > 0 && items.every((item) => selected.has(item.id));
  $("select-visible").indeterminate =
    items.some((item) => selected.has(item.id)) && !$("select-visible").checked;
  $("select-visible").disabled = busy || !items.length;
  $("clear-selection").disabled = busy || !selected.size;
  const rows = items
    .map((item) => {
      const job = jobOf(item.id);
      const status = job?.status || "unmigrated";
      return `<div class="row ${selected.has(item.id) ? "selected" : ""}">
      <input type="checkbox" data-select="${h(item.id)}" aria-label="${h(item.title)}" ${selected.has(item.id) ? "checked" : ""} ${busy ? "disabled" : ""}>
      <button class="row-title" data-preview="${h(item.id)}"><strong>${h(item.title)}</strong><span>${h(dateText(item.updatedAt))}${item.archived ? ` · ${h(t("archived"))}` : ""}${item.project ? ` · ${h(item.projectName || item.project)}` : ""}</span></button>
      <span class="status ${h(status)}">${h(t(status === "needs-review" ? "needsReview" : status))}</span>
      ${job ? `<button class="quiet receipt-button" data-receipt="${h(job.id)}">${h(t("receipt"))}</button>` : ""}
    </div>`;
    })
    .join("");
  if (rows !== rowsMarkup) {
    $("rows").innerHTML = rows;
    rowsMarkup = rows;
  }
  $("empty").hidden = items.length > 0;
  if (!items.length) {
    $("empty").querySelector("h3").textContent = t(
      state.catalogLoaded ? "noMatches" : "emptyTitle",
    );
    $("empty").querySelector("p").textContent = t(
      state.catalogLoaded ? "noMatchesHelp" : "emptyText",
    );
  }
  $("selected-count").textContent = selected.size;
  $("selection-description").textContent = selected.size
    ? t("selected", { n: selected.size })
    : t("selectHelp");
  $("selected-list").innerHTML = [...selected]
    .map(
      (id) =>
        `<li>${h(state.catalog.find((item) => item.id === id)?.title || id)}</li>`,
    )
    .join("");
  $("selected-details").hidden = !selected.size;
  const runnable = [...selected].some(
    (id) => !jobOf(id) || ["pending", "failed"].includes(jobOf(id).status),
  );
  $("start").disabled =
    busy ||
    !runnable ||
    !$("sharing-confirm").checked ||
    !state.accounts.source ||
    !state.accounts.target ||
    state.accounts.source.id === state.accounts.target.id;
  $("message").disabled = busy;
  $("delay").disabled = busy;
  $("sharing-confirm").disabled = busy;
  $("pause").hidden = !state.running;
  $("pause").disabled = state.paused;
  $("pause").textContent = t(state.paused ? "pausing" : "pause");
  const verified = state.jobs.filter((job) => job.status === "verified").length;
  const uncertain = state.jobs.filter(
    (job) => job.status === "needs-review",
  ).length;
  $("progress-area").hidden = !state.jobs.length;
  $("progress").max = state.jobs.length || 1;
  $("progress").value = verified;
  $("progress-label").textContent = t("progress", {
    n: verified,
    total: state.jobs.length,
  });
  $("progress-detail").textContent = uncertain
    ? t("checked", { n: verified, r: uncertain })
    : t("stateSaved");
  $("export").hidden = !state.jobs.length;
  localStorage.setItem(
    `chatport-selection:${sourceKey}`,
    JSON.stringify([...selected]),
  );
  if (previewId?.startsWith("receipt:")) receipt(previewId.slice(8), false);
  for (const key of ["select", "preview", "receipt"]) {
    if (focusData?.[key])
      $("rows")
        .querySelector(`[data-${key}="${CSS.escape(focusData[key])}"]`)
        ?.focus({ preventScroll: true });
  }
}

async function preview(id) {
  previewId = id;
  previewData = null;
  $("preview").hidden = false;
  $("workspace").classList.add("has-preview");
  $("preview-title").textContent =
    state.catalog.find((item) => item.id === id)?.title || t("untitled");
  $("preview-content").textContent = t("previewLoading");
  $("preview-title").focus({ preventScroll: true });
  if (matchMedia("(max-width: 800px)").matches)
    $("preview").scrollIntoView({ block: "start" });
  try {
    const data = await api("preview", { id });
    if (previewId !== id) return;
    previewData = data;
    renderPreview();
  } catch (error) {
    if (previewId === id) $("preview-content").textContent = error.message;
  }
}

function renderPreview() {
  if (!previewData) return;
  $("preview-content").innerHTML = previewData.messages
    .map(
      (message) =>
        `<article class="message ${h(message.role)}"><strong>${h(t(message.role))}</strong><pre>${h(message.text)}</pre>${message.media ? `<p class="media-warning">${h(t("mediaWarning"))}</p>` : ""}</article>`,
    )
    .join("");
}

function receipt(id, focus = true) {
  const job = state.jobs.find((item) => item.id === id);
  if (!job) return;
  const stamp = JSON.stringify({ job, language });
  if (!focus && receiptStamp === stamp) {
    $("preview-content")
      .querySelectorAll("button")
      .forEach((button) => {
        button.disabled = state.running || localBusy;
      });
    return;
  }
  receiptStamp = stamp;
  previewId = `receipt:${id}`;
  previewData = null;
  const previousUrl = $("destination-url")?.value || "";
  $("preview").hidden = false;
  $("workspace").classList.add("has-preview");
  $("preview-title").textContent = `${t("receipt")} · ${job.title}`;
  $("preview-content").innerHTML =
    `<div class="receipt"><p class="status ${h(job.status)}">${h(t(job.status === "needs-review" ? "needsReview" : job.status))}</p>
    ${job.proof ? `<p>${h(t("textCount", { n: job.proof.count }))} · ${h(new Date(job.proof.checkedAt).toLocaleString())}</p>` : ""}
    ${job.error ? `<p class="error">${h(job.error)}</p>` : ""}
    <p><a href="https://chatgpt.com/c/${encodeURIComponent(job.sourceId)}" target="_blank" rel="noreferrer">${h(t("original"))}</a>${job.targetId ? ` · <button class="text-link" data-destination="${h(id)}" ${state.running || localBusy ? "disabled" : ""}>${h(t("destination"))}</button>` : ""}</p>
    ${job.snapshot?.hasMedia ? `<p class="media-warning">${h(t("mediaNote"))}</p>` : ""}
    <details><summary>${h(t("markerLabel"))}</summary><pre>${h(job.marker)}</pre></details>
    ${job.status === "needs-review" ? `<label class="recover"><span>${h(t("destinationUrl"))}</span><input type="url" id="destination-url" placeholder="https://chatgpt.com/c/…" value="${h(previousUrl)}"></label><button data-recheck="${h(id)}" ${state.running || localBusy ? "disabled" : ""}>${h(t("checkAgain"))}</button>` : ""}
    </div>`;
  if (focus) {
    $("preview-title").focus({ preventScroll: true });
    if (matchMedia("(max-width: 800px)").matches)
      $("preview").scrollIntoView({ block: "start" });
  }
}

$("language").addEventListener("click", () => {
  const oldDefault = t("defaultMessage");
  language = language === "zh" ? "en" : "zh";
  localStorage.setItem("chatport-language", language);
  if ($("message").value === oldDefault)
    $("message").value = t("defaultMessage");
  translate();
  render();
  renderPreview();
});
document.querySelectorAll("[data-open]").forEach((button) =>
  button.addEventListener("click", () =>
    action(async () => {
      await api("open", { role: button.dataset.open });
      notice(t("loginNext"));
    }),
  ),
);
$("check-accounts").addEventListener("click", () =>
  action(async () => {
    await api("accounts", {});
    notice(t("accountsReady"));
  }),
);
$("load-catalog").addEventListener("click", () =>
  action(async () => {
    await api("catalog", {});
    notice("");
  }),
);
[
  "search",
  "project",
  "status",
  "from-date",
  "to-date",
  "sharing-confirm",
].forEach((id) => $(id).addEventListener("input", render));
$("reset-filters").addEventListener("click", () => {
  ["search", "project", "status", "from-date", "to-date"].forEach((id) => {
    $(id).value = "";
  });
  render();
});
$("select-visible").addEventListener("change", () => {
  filtered().forEach((item) =>
    $("select-visible").checked
      ? selected.add(item.id)
      : selected.delete(item.id),
  );
  render();
});
$("clear-selection").addEventListener("click", () => {
  selected.clear();
  render();
});
$("rows").addEventListener("change", (event) => {
  const id = event.target.dataset.select;
  if (id) {
    event.target.checked ? selected.add(id) : selected.delete(id);
    render();
  }
});
$("rows").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button?.dataset.preview) preview(button.dataset.preview);
  if (button?.dataset.receipt) receipt(button.dataset.receipt);
});
$("start").addEventListener("click", () =>
  action(async () => {
    await api("start", {
      ids: [...selected],
      confirmSharing: $("sharing-confirm").checked,
      options: {
        message: $("message").value,
        delaySeconds: Number($("delay").value),
      },
    });
    notice("");
  }),
);
$("pause").addEventListener("click", async () => {
  try {
    await api("pause", {});
    await refresh();
  } catch (error) {
    notice(translations[language][error.code] || error.message, true);
  }
});
$("close-preview").addEventListener("click", () => {
  $("preview").hidden = true;
  $("workspace").classList.remove("has-preview");
  previewId = null;
  $("list-heading").scrollIntoView({ block: "nearest" });
});
$("preview-content").addEventListener("click", (event) => {
  const destination =
    event.target.closest("[data-destination]")?.dataset.destination;
  if (destination) {
    action(async () => {
      await api("destination", { id: destination });
      notice("");
    });
    return;
  }
  const id = event.target.closest("button")?.dataset.recheck;
  if (id)
    action(async () => {
      await api("recheck", { id, url: $("destination-url").value.trim() });
      notice("");
      receipt(id, false);
    });
});
$("extension-settings").addEventListener("click", () =>
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }),
);
$("export").addEventListener("click", async (event) => {
  event.preventDefault();
  const report = await api("report");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "chatport-receipts.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener("beforeunload", (event) => {
  if (application?.migration.running) {
    event.preventDefault();
    event.returnValue = "";
  }
});
translate();
render();
if (!globalThis.chrome?.storage?.local) {
  notice(t("extensionOnly"), true);
} else {
  navigator.locks
    .request("chatport-workspace", { ifAvailable: true }, async (lock) => {
      if (!lock) {
        notice(t("workspaceOpen"), true);
        return;
      }
      const store = new Store();
      await store.load();
      application = createApplication(store, new ChatGPT());
      const { accountTabs = {} } =
        await chrome.storage.session.get("accountTabs");
      if (accountTabs.source && accountTabs.target) {
        try {
          await api("accounts");
        } catch (error) {
          notice(translations[language][error.code] || error.message, true);
        }
      }
      localBusy = false;
      await refresh();
      async function poll() {
        try {
          if (!localBusy) await refresh();
        } catch (error) {
          notice(error.message, true);
        }
        setTimeout(poll, 1000);
      }
      setTimeout(poll, 1000);
      await new Promise(() => {});
    })
    .catch((error) => notice(error.message, true));
}
