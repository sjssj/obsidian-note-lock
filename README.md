# Note Lock

A lightweight Obsidian plugin that locks your vault behind a password screen. It hides your notes behind a full-screen overlay until you enter the correct password, with optional auto-lock after idle time and when you switch windows.

> **Security note:** Note Lock is a visual screen lock. It does **not** encrypt your note files. It protects your notes from being seen over your shoulder or by casual viewers when you step away. It is not a replacement for full-disk encryption.

![Lock screen preview](images/lock-screen.png)

## Features

- **Password screen** — a full-screen overlay hides your notes until the correct password is entered.
- **Idle auto lock** — lock automatically after a configurable number of minutes without mouse, keyboard, scroll, touch, or click activity.
- **Window-switch auto lock** — lock when you switch to another window, minimize Obsidian, or hide the app tab.
- **Manual lock** — lock instantly from the command palette.
- **Local-only password** — the password is hashed (SHA-256) and stored in your local Obsidian plugin data. Nothing is sent over the network.
- **Dark and light vault themes** — the lock screen uses a dedicated gradient backdrop.

## Installation

### From the community plugin browser

1. Open **Settings → Community plugins**.
2. Search for **Note Lock**.
3. Install and enable it.

### Manual installation

1. Download the latest release assets: `main.js`, `manifest.json`, and `styles.css`.
2. In your vault, create the folder `.obsidian/plugins/note-lock/`.
3. Place the three files inside that folder.
4. Restart Obsidian and enable **Note Lock** under **Community plugins**.

## Getting started

1. Open **Settings → Note Lock**.
2. Under **Password**, enter a new password (at least 4 characters) and confirm it, then click **Save password**. The plugin enables itself automatically.
3. Toggle **Enable Note Lock** on so the password screen appears every time the vault opens.

## Settings

| Setting | Description |
| --- | --- |
| Enable Note Lock | Show the password screen automatically when the vault opens. |
| Set or change password | Replace the existing password. The old password is not required to change it inside Obsidian. |
| Idle lock time | Minutes without activity before the vault locks. `0` disables idle auto lock. |
| Lock when switching windows | Lock when you switch to another window or minimize Obsidian. |

## Commands

| Command | Description |
| --- | --- |
| **Note Lock: Lock notes** | Lock the vault immediately. |

## Privacy and network use

- The plugin stores only the **hash** of your password locally; the plain-text password is never saved.
- It makes **no network requests**, includes no telemetry, and does not access files outside your vault.
- Uninstalling the plugin removes its stored data together with the plugin.

## Development

```bash
# Install dependencies
npm install

# Watch for changes during development
npm run dev

# Build the production bundle
npm run build
```

The compiled output is `main.js`. New releases are built and attached automatically by the GitHub Actions workflow when a version tag is pushed.

## License

[MIT](LICENSE)
