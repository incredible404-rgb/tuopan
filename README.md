# Yoga 托盘

让 Obsidian 在 Windows 上安静地常驻托盘：开机隐藏、关窗不退出、再次启动不弹选库窗。

## 功能

- **开机自启并隐藏到托盘**：只有开机自启时才隐藏，手动打开时正常显示。
- **关窗留在托盘**：点 X 只隐藏窗口，弹出的副窗口一起隐藏和恢复。
- **不弹选库窗**：Obsidian 已在运行时再点快捷方式，直接恢复窗口。
- **清晰的托盘图标**：配合多尺寸 `.ico`，Windows 按屏幕缩放选对应尺寸。
- **全局快捷键**：默认 `Ctrl+Alt+O` 显示或隐藏窗口，`Ctrl+Alt+N` 打开今天的快速笔记。
- **快速笔记**：同名笔记直接打开，在新标签页打开，不替换正在看的内容。
- **托盘菜单**：显示或隐藏、快速笔记、重启 Obsidian、彻底退出。

## 这些细节和常见托盘插件不同

- 托盘图标创建失败时不隐藏窗口，点 X 会真正关闭，窗口不会找不回来。
- 自启项只在首次启用和切换开关时写入，你在任务管理器里关掉后不会被改回来。
- 关机和注销时不拦截退出，“重新加载应用”也能正常使用。
- 首次启用时会清除 `electron.app.Obsidian` 和 `Obsidian Windows Startup` 两个旧自启项，避免开机启动两次。
- 仓库同步到其他系统时，插件不做任何事。

## 安装

只支持 Windows 桌面版。

1. 在仓库的 `.obsidian/plugins/` 下新建 `yoga-tray` 文件夹，放入 `main.js` 和 `manifest.json`。
2. 先关掉其他托盘插件，否则快捷键和关窗行为会冲突。
3. 在 **设置 → 第三方插件** 里刷新列表，启用 **Yoga 托盘**。

## 让图标更清晰

Obsidian 的图标不随本仓库分发。没有 `tray.ico` 时，插件使用 Electron 取到的 32px 图标，高缩放屏幕上可能不够锐利。

从你自己安装的 Obsidian 本地生成：

```powershell
pwsh -NoProfile -File scripts/build-tray-ico.ps1 -Out "<你的仓库>/.obsidian/plugins/yoga-tray/tray.ico"
```

Obsidian 默认装在当前用户目录，其他位置用 `-Exe` 指定 `Obsidian.exe`。生成后在第三方插件里关闭再启用 Yoga 托盘。也可以在设置里填自己的 `.ico` 路径。

## 致谢

设计时参考了 Background Tray、Traystone 和 Windows Startup and Tray 三个插件的功能。代码为独立编写，与这些项目没有隶属关系。本项目也与 Obsidian 官方无关。

## 许可证

[MIT](LICENSE)
