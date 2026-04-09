const IPC_CHANNELS = {
  listRecentFiles: "campusdoc:list-recent-files",
  removeRecentMissing: "campusdoc:remove-recent-missing",
  openFileDialog: "campusdoc:open-file-dialog",
  openFileByPath: "campusdoc:open-file-by-path",
  openTxtDialog: "campusdoc:open-txt-dialog",
  openTxtByPath: "campusdoc:open-txt-by-path",
  createUntitled: "campusdoc:create-untitled",
  saveCurrent: "campusdoc:save-current",
  saveAs: "campusdoc:save-as",
  exportDocument: "campusdoc:export-document",
  confirmUnsavedChanges: "campusdoc:confirm-unsaved-changes",
};

module.exports = {
  IPC_CHANNELS,
};
