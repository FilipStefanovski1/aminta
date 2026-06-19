// Make clicking the toolbar icon open the side panel.
export {}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Aminta sidePanel error:", error))
