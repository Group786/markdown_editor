"use strict";
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const path = require("node:path");
const fs = require("fs");
const started = require("electron-squirrel-startup");
if (started) {
  app.quit();
}
const openWindows = /* @__PURE__ */ new Set();
const windowFilePaths = /* @__PURE__ */ new WeakMap();
const createWindow = () => {
  const newWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // Set contextIsolation to TRUE for security when using a preload script (BEST PRACTICE)
      contextIsolation: true,
      // Node integration should be false when contextIsolation is true
      nodeIntegration: false
    }
  });
  {
    newWindow.loadURL("http://localhost:5173");
  }
  openWindows.add(newWindow);
  newWindow.on("closed", () => {
    openWindows.delete(newWindow);
  });
  return newWindow;
};
const initializeIpcHandlers = () => {
  ipcMain.on("open-file-dialog", (event) => {
    getFileFromUser(BrowserWindow.fromWebContents(event.sender));
  });
  ipcMain.on("save-file-request", (event, content, defaultFileName) => {
    saveFileToUser(BrowserWindow.fromWebContents(event.sender), content, defaultFileName);
  });
  ipcMain.on("overwrite-file-request", (event, content, fullPath) => {
    overwriteFile(BrowserWindow.fromWebContents(event.sender), content, fullPath);
  });
  ipcMain.on("new-window-request", () => {
    createWindow();
  });
  ipcMain.on("update-window-title", (event, title) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      window.setTitle(title);
    }
  });
};
const getFileFromUser = (window) => {
  if (!window) return;
  const files = dialog.showOpenDialogSync(window, {
    properties: ["openFile"],
    title: "Open Markdown or Text File",
    filters: [
      { name: "Text Files", extensions: ["txt"] },
      { name: "Markdown Files", extensions: ["md", "markdown"] }
    ]
  });
  if (files && files.length > 0) {
    openFile(window, files[0]);
  }
};
const openFile = (window, filePath) => {
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Failed to read file:", err);
      window.webContents.send("save-status", `Error loading file: ${err.message}`);
      return;
    }
    windowFilePaths.set(window, filePath);
    const displayFileName = path.basename(filePath);
    window.webContents.send("file-content-ready", data, displayFileName, filePath);
  });
};
const saveFileToUser = (window, content, defaultFileName) => {
  if (!window) return;
  const filePath = dialog.showSaveDialogSync(window, {
    title: "Save Markdown File",
    defaultPath: defaultFileName,
    filters: [
      { name: "Markdown Files", extensions: ["md", "markdown"] },
      { name: "Text Files", extensions: ["txt"] }
    ]
  });
  if (filePath) {
    fs.writeFile(filePath, content, "utf8", (err) => {
      if (err) {
        console.error("Failed to save file:", err);
        window.webContents.send("save-status", `Error saving file: ${err.message}`);
      } else {
        windowFilePaths.set(window, filePath);
        const displayFileName = path.basename(filePath);
        window.webContents.send("save-status", `File successfully saved as "${displayFileName}"`, filePath, displayFileName);
      }
    });
  } else {
    window.webContents.send("save-status", "Save As operation cancelled.");
  }
};
const overwriteFile = (window, content, fullPath) => {
  if (!window) return;
  fs.writeFile(fullPath, content, "utf8", (err) => {
    if (err) {
      console.error("Failed to overwrite file:", err);
      window.webContents.send("save-status", `Error overwriting file: ${err.message}`);
    } else {
      const displayFileName = path.basename(fullPath);
      window.webContents.send("save-status", `File successfully saved to "${displayFileName}"`);
    }
  });
};
const setApplicationMenu = () => {
  const template = [
    // --- File Menu ---
    {
      label: "File",
      submenu: [
        {
          label: "Open File...",
          accelerator: "CmdOrCtrl+O",
          click: (menuItem, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.webContents.send("menu-open-file");
            }
          }
        },
        {
          label: "Save File",
          accelerator: "CmdOrCtrl+S",
          click: (menuItem, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.webContents.send("menu-save-file");
            }
          }
        },
        { type: "separator" },
        {
          label: "Export HTML",
          accelerator: "CmdOrCtrl+Shift+E",
          click: (menuItem, focusedWindow) => {
            if (focusedWindow) {
              focusedWindow.webContents.send("menu-export-html");
            }
          }
        }
      ]
    },
    // --- Edit Menu (Standard roles) ---
    // This role automatically creates Undo, Redo, Cut, Copy, Paste, Select All
    { role: "editMenu" },
    // --- Window Menu (Standard roles) ---
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" }
      ]
    },
    // --- Help Menu ---
    {
      label: "Help",
      submenu: [
        // Search is macOS-specific
        ...process.platform === "darwin" ? [{ role: "search" }] : [],
        {
          label: "Visit Website",
          click: async () => {
            await shell.openExternal("https://www.google.com");
          }
        }
      ]
    }
  ];
  if (process.platform === "darwin") {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    });
  }
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};
app.whenReady().then(() => {
  createWindow();
  initializeIpcHandlers();
  setApplicationMenu();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
