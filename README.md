# Obsidian Note Lock

为 Obsidian 笔记加锁的插件。通过全屏遮罩弹框保护笔记内容，需要输入密码才能查看。

> **注意**：本插件仅做 UI 层面的遮挡保护，不加密实际文件内容。适用于防止旁人偷看屏幕内容，不适用于对抗专业级文件窃取。

## 功能特性

- 🔒 **密码锁定**：输入正确密码才能查看笔记内容
- ⏱️ **自动锁定**：可设置 N 分钟无操作后自动锁定
- 🖥️ **屏幕切换锁定**：切换窗口 / 最小化 Obsidian 时自动锁定
- ⌨️ **快捷键命令**：支持手动锁定 / 解锁命令
- ⚙️ **可视化设置**：在设置面板中配置所有选项

## 安装方法

### 方式一：BRAT 安装（推荐）

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. 在 BRAT 中选择 "Add Beta plugin"
3. 输入仓库地址：`https://github.com/sjssj/obsidian-note-lock`
4. 安装后重启 Obsidian

### 方式二：手动安装

1. 下载最新 release 中的 `main.js`、`manifest.json`、`styles.css`
2. 在你的 Obsidian 仓库中创建文件夹 `.obsidian/plugins/obsidian-note-lock/`
3. 将三个文件放入该文件夹
4. 在 Obsidian 设置中启用插件

## 使用方法

### 首次使用

1. 进入 **设置 → Note Lock**
2. 在「设置 / 修改密码」处输入密码（至少 4 位），点击保存
3. 开启「启用笔记加锁」开关

### 自动锁定设置

- **自动锁定时间**：拖动滑块设置 0~60 分钟无操作后自动锁定（设为 0 关闭）
- **切换屏幕后自动锁定**：开启后，切换到其他窗口或最小化 Obsidian 时自动锁定

### 手动锁定

- 按 `Ctrl+P` 打开命令面板
- 输入 "立即锁定笔记" 并执行

## 隐私说明

- 密码通过 **SHA-256** 哈希后存储在 Obsidian 的本地数据中，不会明文保存
- 插件不会上传任何数据到网络
- 卸载插件时，存储的密码数据会随插件数据一同清除

## 开发

```bash
# 安装依赖
npm install

# 开发模式（监听变化）
npm run dev

# 构建生产版本
npm run build
```

## License

MIT
