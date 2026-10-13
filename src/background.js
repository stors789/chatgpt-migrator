chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("public/index.html");
  const [existing] = await chrome.tabs.query({ url });
  if (existing) {
    await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.tabs.update(existing.id, { active: true });
    return;
  }
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const regular = windows.find((window) => !window.incognito);
  if (regular) await chrome.tabs.create({ url, windowId: regular.id });
  else await chrome.windows.create({ url, incognito: false });
});
