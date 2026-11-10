# Tuopan

[简体中文](README.md) | English

> **When & Why to Use**: For Windows users who keep [Obsidian](https://obsidian.md) running all day as an instant-access note app—an Obsidian plugin that starts hidden in the system tray at login, hides to tray on close, skips the vault picker on relaunch, and opens today's quick note via global hotkeys.

**Verified on Windows only.** The plugin stays inactive on other systems. Its interface is in Chinese.

## Features

- **Start hidden at login**: only the login launch hides the window. Opening Obsidian by hand shows it as usual.
- **Close to tray**: the close button hides the window, along with any pop-out windows.
- **No vault picker on relaunch**: opening Obsidian while it is already running restores the existing window.
- **Sharp tray icon**: a multi-size icon is built on first run, so Windows picks the right size for your display scale.
- **Global hotkeys**: optional hotkeys to show or hide the window and to open today's quick note. None are set by default.
- **Quick note**: opens today's note in a new tab without replacing the one you are reading.
- **Tray menu**: show or hide, quick note, relaunch, and quit.

## Installation

Turn off other tray plugins first, because their hotkeys and close behavior conflict with this one.

### With BRAT

1. Install BRAT from the community plugins.
2. Run the command `BRAT: Add a beta plugin for testing` and enter `incredible404-rgb/tuopan`.
3. Enable **Tuopan** under community plugins.

### Manually

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/incredible404-rgb/tuopan/releases/latest).
2. Create the folder `.obsidian/plugins/tuopan/` in your vault and put both files in it.
3. Reload the list under **Settings → Community plugins** and enable **Tuopan**.

## Usage

1. Open **Settings → Tuopan** and turn on the login option (开机自启) if you want Obsidian to start with Windows.
2. Keep start hidden (开机时隐藏到托盘) on to start in the tray. Click the tray icon to show or hide the window.
3. Right-click the tray icon for the quick note, relaunch, and quit actions. Use quit (彻底退出) to really close Obsidian.
4. To add hotkeys, enter a value such as `CmdOrCtrl+Alt+O` in the hotkey fields. They apply system-wide once you leave the field.
5. Set the quick note folder and file name format under the quick note section (快速笔记).

## How it behaves

- If the tray icon cannot be created, the window is never hidden and the close button really closes it.
- Autostart is off by default and is only written when you first enable it or change the setting. Turning it off in Task Manager is respected.
- Shutdown and sign-out are not blocked, and reloading the app still works.

## Access outside the vault

Tuopan uses no network connections and has no telemetry. This is everything it touches outside the vault:

- **Reads the icon from `Obsidian.exe`** to build `tray.ico` in the plugin folder. Obsidian's icon is not distributed with this project.
- **Writes a Windows login item**, only when autostart is on. It adds the current user's Run value `Obsidian 托盘` and removes `electron.app.Obsidian` and `Obsidian Windows Startup`, which other tray plugins leave behind and which would start the app twice.
- **Registers system-wide hotkeys**, only those you set.

## Credits

The feature set was inspired by Background Tray, Traystone, and Windows Startup and Tray. The code was written independently and this project is not affiliated with them or with Obsidian.

## License

[MIT](LICENSE)
