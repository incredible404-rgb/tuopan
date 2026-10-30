"use strict";

const { Plugin, PluginSettingTab, Setting, Notice, Platform, moment, normalizePath } = require("obsidian");

const STARTUP_NAME = "Obsidian 托盘";
const STARTUP_FLAG = "--tuopan-startup";
// Other tray plugins leave these Run values behind; each would launch Obsidian a second time.
const LEGACY_STARTUP_NAMES = ["electron.app.Obsidian", "Obsidian Windows Startup"];
const PICKER_SWEEP_MS = [0, 100, 300, 1000, 3000];

const DEFAULTS = {
  launchOnStartup: false,
  startupApplied: false,
  startHidden: true,
  closeToTray: true,
  focusOnRelaunch: true,
  hideTaskbarIcon: false,
  trayIconPath: "",
  trayTooltip: "{{vault}} — Obsidian",
  toggleHotkey: "",
  quickNoteHotkey: "",
  quickNoteFolder: "",
  quickNoteFormat: "YYYY-MM-DD",
};

function getRemote() {
  try {
    return window.require("@electron/remote");
  } catch {}
  try {
    return window.require("electron").remote ?? null;
  } catch {}
  return null;
}

module.exports = class TuopanPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new TuopanSettings(this.app, this));
    // The vault syncs to other devices; tray and Run entries only make sense on Windows.
    if (!Platform.isDesktopApp || process.platform !== "win32") return;

    this.remote = getRemote();
    if (!this.remote) {
      new Notice("托盘：无法访问 Electron，托盘不可用。");
      return;
    }
    this.win = this.remote.getCurrentWindow();
    this.quitting = false;
    this.allowReload = false;
    this.hiddenSecondaries = [];

    await this.createTray();
    this.interceptClose();
    this.interceptReload();
    this.watchRelaunch();
    this.registerHotkeys();
    this.applyTaskbar();
    // Applied once: rewriting on every launch would undo a Task Manager disable.
    if (this.settings.launchOnStartup && !this.settings.startupApplied) {
      // Not awaited: verification takes seconds and must not delay hiding at login.
      this.applyStartup().then(async (ok) => {
        if (!ok) return;
        this.settings.startupApplied = true;
        await this.save();
      });
    }

    this.addCommand({ id: "toggle-window", name: "显示或隐藏窗口", callback: () => this.toggle() });
    this.addCommand({ id: "quick-note", name: "打开今天的快速笔记", callback: () => this.quickNote() });

    // Hide here rather than at layout-ready, so the window barely flashes at login.
    this.hideIfStartupLaunch();
    this.app.workspace.onLayoutReady(() => this.refreshTray());
  }

  onunload() {
    if (!this.remote) return;
    this.unregisterHotkeys();
    this.releaseClose();
    this.releaseReload();
    this.unwatchRelaunch();
    this.destroyTray();
    if (!this.quitting) {
      try {
        this.win.setSkipTaskbar(false);
      } catch {}
      this.show();
    }
  }

  async save() {
    await this.saveData(this.settings);
  }

  // Only the marked login launch hides; opening Obsidian by hand stays visible.
  hideIfStartupLaunch() {
    const { app, process: mainProcess } = this.remote;
    const name = STARTUP_FLAG.slice(2);
    if (!mainProcess.argv.includes(STARTUP_FLAG) || !app.commandLine.hasSwitch(name)) return;
    // argv outlives a plugin reload, so the switch is the once-only marker.
    app.commandLine.removeSwitch(name);
    if (this.settings.startHidden) this.hide();
  }

  // Electron writes login items in the background and reports no failure, so read the result back.
  async applyStartup() {
    const { app, process: mainProcess } = this.remote;
    const path = mainProcess.execPath;
    const args = [STARTUP_FLAG];
    const openAtLogin = this.settings.launchOnStartup;
    const isCorrect = () => {
      const names = app.getLoginItemSettings({ path, args }).launchItems.map((item) => item.name);
      return names.includes(STARTUP_NAME) === openAtLogin && !names.some((n) => LEGACY_STARTUP_NAMES.includes(n));
    };
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        for (const name of LEGACY_STARTUP_NAMES) app.setLoginItemSettings({ openAtLogin: false, name, path });
        app.setLoginItemSettings({ openAtLogin, name: STARTUP_NAME, path, args });
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        if (isCorrect()) return true;
      }
      new Notice("托盘：自启设置没有生效，请在设置里重新打开开关，或检查任务管理器的启动项。", 10000);
    } catch (e) {
      new Notice(`托盘：自启设置失败：${e.message ?? e}`, 10000);
    }
    return false;
  }

  // Without a tray icon a hidden window has no way back, so closing must then really close.
  shouldKeepRunning() {
    return this.settings.closeToTray && !this.quitting && !this.allowReload && !!this.tray;
  }

  interceptClose() {
    this.beforeUnload = (e) => {
      if (!this.shouldKeepRunning()) return;
      e.preventDefault();
      e.returnValue = false;
      e.stopImmediatePropagation();
      this.hide();
    };
    window.addEventListener("beforeunload", this.beforeUnload, { capture: true });

    this.onClose = (e) => {
      if (!this.shouldKeepRunning()) return;
      e.preventDefault();
      this.hide();
    };
    // Without this, a hidden window can block Windows from shutting down.
    this.onQuit = () => {
      this.quitting = true;
    };
    this.win.on("close", this.onClose);
    this.win.on("query-session-end", this.onQuit);
    this.win.on("session-end", this.onQuit);
    this.remote.app.on("before-quit", this.onQuit);
  }

  releaseClose() {
    window.removeEventListener("beforeunload", this.beforeUnload, { capture: true });
    try {
      this.win.removeListener("close", this.onClose);
      this.win.removeListener("query-session-end", this.onQuit);
      this.win.removeListener("session-end", this.onQuit);
      this.remote.app.removeListener("before-quit", this.onQuit);
    } catch {}
  }

  // A reload also fires beforeunload, and would otherwise hide the window instead of reloading.
  interceptReload() {
    const command = this.app.commands?.commands?.["app:reload"];
    if (!command?.callback) return;
    this.reloadCommand = command;
    this.originalReload = command.callback;
    command.callback = (...args) => {
      this.allowReload = true;
      return this.originalReload.apply(command, args);
    };
  }

  releaseReload() {
    if (this.reloadCommand) this.reloadCommand.callback = this.originalReload;
    this.reloadCommand = null;
  }

  // Obsidian opens a fixed-size vault picker on a second launch, possibly before this
  // renderer hears about the launch, so sweep for it instead of relying on event order.
  watchRelaunch() {
    this.onSecondInstance = () => {
      if (!this.settings.focusOnRelaunch) return;
      this.show();
      for (const ms of PICKER_SWEEP_MS) window.setTimeout(() => this.closePickers(), ms);
    };
    this.remote.app.prependListener("second-instance", this.onSecondInstance);
  }

  unwatchRelaunch() {
    try {
      this.remote.app.removeListener("second-instance", this.onSecondInstance);
    } catch {}
  }

  closePickers() {
    try {
      for (const w of this.remote.BrowserWindow.getAllWindows()) {
        if (w.id !== this.win.id && !w.isDestroyed() && !w.isResizable()) w.destroy();
      }
    } catch {}
  }

  secondaryWindows() {
    const found = new Map();
    const add = (w) => {
      try {
        const ew = w?.electronWindow ?? w?.require?.("@electron/remote").getCurrentWindow();
        if (ew && !ew.isDestroyed() && ew.id !== this.win.id) found.set(ew.id, ew);
      } catch {}
    };
    this.app.workspace.floatingSplit?.children?.forEach((c) => add(c.win));
    add(this.app.setting?.popout?.win);
    return [...found.values()];
  }

  hide() {
    if (!this.tray) {
      try {
        this.win.minimize();
      } catch {}
      return;
    }
    for (const w of this.secondaryWindows()) {
      try {
        if (w.isVisible()) {
          w.hide();
          this.hiddenSecondaries.push(w);
        }
      } catch {}
    }
    try {
      this.win.hide();
    } catch {}
  }

  show() {
    try {
      if (this.win.isMinimized()) this.win.restore();
      this.win.show();
    } catch {}
    for (const w of this.hiddenSecondaries) {
      try {
        if (!w.isDestroyed()) w.showInactive();
      } catch {}
    }
    this.hiddenSecondaries = [];
    try {
      this.win.focus();
    } catch {}
  }

  toggle() {
    try {
      if (this.win.isVisible() && !this.win.isMinimized()) this.hide();
      else this.show();
    } catch {}
  }

  async createTray() {
    this.destroyTray();
    try {
      this.tray = new this.remote.Tray(await this.loadIcon());
      this.tray.on("click", () => this.toggle());
      this.refreshTray();
    } catch (e) {
      this.tray = null;
      new Notice(`托盘：托盘图标创建失败：${e.message ?? e}`);
    }
  }

  // Tray uses only an image's 1x bitmap, so scale-factor variants are ignored and a 16px base
  // gets stretched at high DPI. An .ico path lets Windows pick the exact frame for the current DPI.
  async loadIcon() {
    const { nativeImage, app, process: mainProcess } = this.remote;
    if (this.settings.trayIconPath) {
      const custom = nativeImage.createFromPath(this.settings.trayIconPath);
      if (!custom.isEmpty()) return custom;
      new Notice("托盘：自定义图标读取失败，已改用自带图标。");
    }
    const { adapter } = this.app.vault;
    const ico = `${this.manifest.dir}/tray.ico`;
    try {
      if (!(await adapter.exists(ico))) await this.buildIcon(ico);
      const image = nativeImage.createFromPath(adapter.getFullPath(ico));
      if (!image.isEmpty()) return image;
    } catch {}
    return app.getFileIcon(mainProcess.execPath, { size: "normal" });
  }

  // Built locally from the installed app so Obsidian's icon is never redistributed.
  async buildIcon(path) {
    const { app, process: mainProcess } = this.remote;
    const frames = [];
    for (const size of ["small", "normal", "large"]) {
      const icon = await app.getFileIcon(mainProcess.execPath, { size });
      if (!icon.isEmpty()) frames.push({ width: icon.getSize().width, png: new Uint8Array(icon.toPNG()) });
    }
    const headerSize = 6 + 16 * frames.length;
    const bytes = new Uint8Array(headerSize + frames.reduce((sum, f) => sum + f.png.length, 0));
    const view = new DataView(bytes.buffer);
    view.setUint16(2, 1, true);
    view.setUint16(4, frames.length, true);
    let offset = headerSize;
    frames.forEach((frame, i) => {
      const entry = 6 + 16 * i;
      view.setUint8(entry, frame.width);
      view.setUint8(entry + 1, frame.width);
      view.setUint16(entry + 4, 1, true);
      view.setUint16(entry + 6, 32, true);
      view.setUint32(entry + 8, frame.png.length, true);
      view.setUint32(entry + 12, offset, true);
      bytes.set(frame.png, offset);
      offset += frame.png.length;
    });
    await this.app.vault.adapter.writeBinary(path, bytes.buffer);
  }

  destroyTray() {
    try {
      this.tray?.destroy();
    } catch {}
    this.tray = null;
  }

  refreshTray() {
    if (!this.tray) return;
    const vault = this.app.vault.getName();
    this.tray.setToolTip(this.settings.trayTooltip.replace(/\{\{vault\}\}/g, vault).slice(0, 127));
    this.tray.setContextMenu(
      this.remote.Menu.buildFromTemplate([
        { label: vault, enabled: false },
        { type: "separator" },
        { label: "显示或隐藏窗口", click: () => this.toggle() },
        { label: "打开今天的快速笔记", click: () => this.quickNote() },
        { type: "separator" },
        { label: "重启 Obsidian", click: () => this.relaunch() },
        { label: "彻底退出", click: () => this.quit() },
      ])
    );
  }

  relaunch() {
    this.quitting = true;
    const { app } = this.remote;
    app.relaunch();
    app.quit();
  }

  quit() {
    this.quitting = true;
    this.remote.app.quit();
  }

  registerHotkeys() {
    const bind = (key, fn) => {
      if (!key) return;
      try {
        if (!this.remote.globalShortcut.register(key, fn)) new Notice(`托盘：快捷键 ${key} 已被占用。`);
      } catch {
        new Notice(`托盘：快捷键 ${key} 格式无效。`);
      }
    };
    this.hotkeys = [this.settings.toggleHotkey, this.settings.quickNoteHotkey].filter(Boolean);
    bind(this.settings.toggleHotkey, () => this.toggle());
    bind(this.settings.quickNoteHotkey, () => this.quickNote());
  }

  unregisterHotkeys() {
    for (const key of this.hotkeys ?? []) {
      try {
        this.remote.globalShortcut.unregister(key);
      } catch {}
    }
    this.hotkeys = [];
  }

  applyTaskbar() {
    try {
      this.win.setSkipTaskbar(this.settings.hideTaskbarIcon);
    } catch {}
  }

  async quickNote() {
    const { vault, workspace } = this.app;
    const name = moment().format(this.settings.quickNoteFormat || DEFAULTS.quickNoteFormat).replace(/[*"\\<>:|?/]/g, "-");
    const folder = normalizePath(this.settings.quickNoteFolder || "/");
    const path = normalizePath(folder === "/" ? `${name}.md` : `${folder}/${name}.md`);
    try {
      if (folder !== "/" && !vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
      const file = vault.getAbstractFileByPath(path) ?? (await vault.create(path, ""));
      const opened = workspace.getLeavesOfType("markdown").find((leaf) => leaf.view?.file?.path === path);
      // A new tab, so the note being read is never replaced.
      const leaf = opened ?? workspace.getLeaf("tab");
      if (!opened) await leaf.openFile(file, { active: true, state: { mode: "source" } });
      workspace.setActiveLeaf(leaf, { focus: true });
      this.show();
    } catch (e) {
      new Notice(`托盘：快速笔记失败：${e.message ?? e}`);
    }
  }
};

class TuopanSettings extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl: el, plugin } = this;
    el.empty();
    const heading = (name) => new Setting(el).setName(name).setHeading();
    const toggle = (key, name, desc, after) =>
      new Setting(el).setName(name).setDesc(desc).addToggle((t) =>
        t.setValue(plugin.settings[key]).onChange(async (v) => {
          plugin.settings[key] = v;
          await plugin.save();
          if (plugin.remote) after?.();
        })
      );
    // Saved on blur or Enter: half-typed hotkeys and paths must not be applied.
    const text = (key, name, desc, after) =>
      new Setting(el).setName(name).setDesc(desc).addText((t) => {
        t.setValue(plugin.settings[key]);
        t.inputEl.addEventListener("change", async () => {
          plugin.settings[key] = t.getValue().trim();
          await plugin.save();
          if (plugin.remote) after?.();
        });
      });
    const hotkeys = () => {
      plugin.unregisterHotkeys();
      plugin.registerHotkeys();
    };

    toggle("launchOnStartup", "开机自启", "登录 Windows 时启动，同时清除其他托盘插件留下的自启项。之后也可以在任务管理器里单独关闭。", () => plugin.applyStartup());
    toggle("startHidden", "开机时隐藏到托盘", "只对开机自启生效，手动打开时正常显示。");
    toggle("closeToTray", "关闭窗口时留在托盘", "点 X 时隐藏到托盘，不退出。托盘图标创建失败时会真正关闭，避免窗口找不回来。");
    toggle("focusOnRelaunch", "再次启动时恢复窗口", "已在运行时再点快捷方式，直接恢复窗口，不弹选库窗。");
    toggle("hideTaskbarIcon", "隐藏任务栏图标", "窗口显示时也不占任务栏。", () => plugin.applyTaskbar());

    heading("托盘图标");
    text("trayIconPath", "自定义图标路径", "留空时使用 Obsidian 自带图标。填 .ico 时系统会按屏幕缩放选最清晰的尺寸。", () => plugin.createTray());
    text("trayTooltip", "鼠标悬停提示", "{{vault}} 会替换为仓库名。", () => plugin.refreshTray());

    heading("快捷键");
    text("toggleHotkey", "显示或隐藏窗口", "全局生效，例如 CmdOrCtrl+Alt+O，留空则关闭。", hotkeys);
    text("quickNoteHotkey", "打开今天的快速笔记", "全局生效，例如 CmdOrCtrl+Alt+N，留空则关闭。", hotkeys);

    heading("快速笔记");
    text("quickNoteFolder", "存放文件夹", "留空时放在仓库根目录。");
    text("quickNoteFormat", "文件名格式", "Moment.js 格式。同名笔记已存在时直接打开。");
  }
}
