import { Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';

// ==================== Types ====================

interface NoteLockSettings {
	passwordHash: string;
	autoLockMinutes: number;
	lockOnWindowSwitch: boolean;
	enabled: boolean;
}

const DEFAULT_SETTINGS: NoteLockSettings = {
	passwordHash: '',
	autoLockMinutes: 5,
	lockOnWindowSwitch: true,
	enabled: false,
};

// ==================== Password hashing ====================

/**
 * Fallback non-cryptographic hash used only when crypto.subtle is unavailable.
 */
function fallbackHash(input: string): string {
	let h1 = 0x811c9dc5;
	let h2 = 0;
	for (let i = 0; i < input.length; i++) {
		const code = input.charCodeAt(i);
		h1 ^= code;
		h1 = Math.imul(h1, 0x01000193);
		h2 = (h2 * 31 + code) >>> 0;
	}
	return 'fb' + h1.toString(16) + h2.toString(16);
}

async function hashPassword(password: string): Promise<string> {
	const material = password + 'note-lock-salt-v1';
	if (typeof crypto !== 'undefined' && crypto.subtle) {
		const encoder = new TextEncoder();
		const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(material));
		return Array.from(new Uint8Array(buffer))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
	}
	return fallbackHash(material);
}

// ==================== Lock overlay ====================

class LockOverlay {
	private overlayEl: HTMLElement | null = null;
	private inputEl: HTMLInputElement | null = null;
	private errorEl: HTMLElement | null = null;
	private plugin: NoteLockPlugin;
	private onUnlockSuccess: () => void;

	constructor(plugin: NoteLockPlugin, onUnlockSuccess: () => void) {
		this.plugin = plugin;
		this.onUnlockSuccess = onUnlockSuccess;
	}

	private createLockIcon(container: HTMLElement): void {
		const svgNS = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(svgNS, 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', '#4a90d9');
		svg.setAttribute('stroke-width', '2');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');

		const rect = document.createElementNS(svgNS, 'rect');
		rect.setAttribute('x', '3');
		rect.setAttribute('y', '11');
		rect.setAttribute('width', '18');
		rect.setAttribute('height', '11');
		rect.setAttribute('rx', '2');
		rect.setAttribute('ry', '2');

		const path = document.createElementNS(svgNS, 'path');
		path.setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4');

		svg.appendChild(rect);
		svg.appendChild(path);
		container.appendChild(svg);
	}

	open(): void {
		if (this.overlayEl) return;

		const overlay = document.body.createDiv({ cls: 'note-lock-overlay' });
		const card = overlay.createDiv({ cls: 'note-lock-card' });

		const iconWrap = card.createDiv({ cls: 'note-lock-icon' });
		this.createLockIcon(iconWrap);

		card.createDiv({ cls: 'note-lock-title', text: 'Vault is locked' });
		card.createDiv({
			cls: 'note-lock-subtitle',
			text: 'Enter your password to view your notes.',
		});

		const input = card.createEl('input', {
			cls: 'note-lock-input',
			attr: {
				type: 'password',
				placeholder: 'Password',
				autocomplete: 'off',
				spellcheck: 'false',
			},
		});

		const error = card.createDiv({ cls: 'note-lock-error' });

		const button = card.createEl('button', {
			cls: 'note-lock-button',
			text: 'Unlock',
		});

		const tryUnlock = async () => {
			await this.tryUnlock();
		};

		button.addEventListener('click', tryUnlock);
		input.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				void tryUnlock();
			}
		});

		this.overlayEl = overlay;
		this.inputEl = input;
		this.errorEl = error;

		setTimeout(() => input.focus(), 100);
	}

	private async tryUnlock(): Promise<void> {
		if (!this.inputEl || !this.errorEl) return;

		const password = this.inputEl.value;
		if (!password) {
			this.showError('Please enter your password.');
			return;
		}

		const inputHash = await hashPassword(password);
		if (inputHash === this.plugin.settings.passwordHash) {
			this.close();
			this.onUnlockSuccess();
		} else {
			this.showError('Incorrect password. Please try again.');
			this.inputEl.value = '';
			this.inputEl.focus();
			if (this.overlayEl) {
				this.overlayEl.animate(
					[
						{ transform: 'translateX(0)' },
						{ transform: 'translateX(-10px)' },
						{ transform: 'translateX(10px)' },
						{ transform: 'translateX(-10px)' },
						{ transform: 'translateX(0)' },
					],
					{ duration: 300 },
				);
			}
		}
	}

	private showError(message: string): void {
		if (this.errorEl) {
			this.errorEl.setText(message);
		}
		if (this.inputEl) {
			this.inputEl.addClass('error');
			window.setTimeout(() => this.inputEl?.removeClass('error'), 1500);
		}
	}

	close(): void {
		if (this.overlayEl) {
			this.overlayEl.remove();
			this.overlayEl = null;
			this.inputEl = null;
			this.errorEl = null;
		}
	}

	get isOpen(): boolean {
		return this.overlayEl !== null;
	}
}

// ==================== Plugin ====================

export default class NoteLockPlugin extends Plugin {
	settings: NoteLockSettings = DEFAULT_SETTINGS;
	private overlay: LockOverlay | null = null;
	private idleTimer: number | null = null;
	private locked = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: 'lock-notes',
			name: 'Lock notes',
			checkCallback: (checking: boolean) => {
				if (this.locked) return false;
				if (!checking) this.lock();
				return true;
			},
		});

		this.addSettingTab(new NoteLockSettingTab(this.app, this));

		const resetIdle = () => this.resetIdleTimer();
		this.registerDomEvent(document, 'mousemove', resetIdle);
		this.registerDomEvent(document, 'keydown', resetIdle);
		this.registerDomEvent(document, 'click', resetIdle);
		this.registerDomEvent(document, 'scroll', resetIdle);
		this.registerDomEvent(document, 'touchstart', resetIdle);

		this.registerDomEvent(document, 'visibilitychange', this.handleVisibilityChange);
		window.addEventListener('blur', this.handleWindowBlur);
		this.register(() => window.removeEventListener('blur', this.handleWindowBlur));

		if (this.settings.enabled && this.settings.passwordHash) {
			window.setTimeout(() => this.lock(), 500);
		}
	}

	onunload(): void {
		this.clearIdleTimer();
		this.overlay?.close();
		this.overlay = null;
	}

	// ---------- Lock / unlock ----------

	lock(): void {
		if (this.locked) return;
		if (!this.settings.passwordHash) {
			new Notice('Set a password in the Note Lock settings first.');
			return;
		}

		this.locked = true;
		this.clearIdleTimer();

		this.overlay = new LockOverlay(this, () => {
			this.locked = false;
			this.overlay = null;
			this.resetIdleTimer();
			new Notice('Unlocked.');
		});
		this.overlay.open();
	}

	/** Internal cleanup used when the plugin is disabled in settings. */
	forceUnlock(): void {
		this.locked = false;
		this.overlay?.close();
		this.overlay = null;
	}

	// ---------- Idle timer ----------

	private resetIdleTimer(): void {
		if (!this.settings.enabled || !this.settings.passwordHash) return;
		if (this.locked) return;

		this.clearIdleTimer();
		if (this.settings.autoLockMinutes > 0) {
			this.idleTimer = window.setTimeout(
				() => this.lock(),
				this.settings.autoLockMinutes * 60 * 1000,
			);
		}
	}

	private clearIdleTimer(): void {
		if (this.idleTimer !== null) {
			window.clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}

	// ---------- Window / screen switch ----------

	private handleVisibilityChange = (): void => {
		if (document.hidden) this.onWindowSwitch();
	};

	private handleWindowBlur = (): void => {
		this.onWindowSwitch();
	};

	private onWindowSwitch(): void {
		if (!this.settings.enabled || !this.settings.lockOnWindowSwitch) return;
		if (!this.settings.passwordHash) return;
		if (this.locked) return;

		window.setTimeout(() => {
			if (document.hidden || !document.hasFocus()) {
				this.lock();
			}
		}, 300);
	}

	// ---------- Persistence ----------

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

// ==================== Settings tab ====================

class NoteLockSettingTab extends PluginSettingTab {
	plugin: NoteLockPlugin;

	constructor(app: NoteLockPlugin['app'], plugin: NoteLockPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Enable Note Lock')
			.setDesc('Show the password screen automatically when the vault opens.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
					if (!value) this.plugin.forceUnlock();
					this.display();
				}),
			);

		// ---------- Password ----------
		new Setting(containerEl).setName('Password').setHeading();

		const hasPassword = !!this.plugin.settings.passwordHash;

		new Setting(containerEl)
			.setName('Current status')
			.setDesc(hasPassword ? 'A password is set.' : 'No password has been set yet.')
			.addExtraButton((button) =>
				button
					.setIcon(hasPassword ? 'check-circle' : 'x-circle')
					.setTooltip(hasPassword ? 'Password configured' : 'Set a password')
					.setDisabled(true),
			);

		new Setting(containerEl)
			.setName('Set or change password')
			.setDesc('At least 4 characters. The password is hashed before it is stored locally.');

		const passwordRow = containerEl.createDiv('note-lock-password-row');
		const firstInput = passwordRow.createEl('input', {
			cls: 'note-lock-setting-input',
			attr: { type: 'password', placeholder: 'New password', autocomplete: 'new-password' },
		});
		const secondInput = passwordRow.createEl('input', {
			cls: 'note-lock-setting-input',
			attr: { type: 'password', placeholder: 'Confirm password', autocomplete: 'new-password' },
		});

		const saveButton = passwordRow.createEl('button', {
			cls: 'mod-cta note-lock-save-password',
			text: 'Save password',
		});

		saveButton.addEventListener('click', async () => {
			const first = firstInput.value;
			const second = secondInput.value;

			if (!first) {
				new Notice('Password cannot be empty.');
				return;
			}
			if (first.length < 4) {
				new Notice('Password must be at least 4 characters.');
				return;
			}
			if (first !== second) {
				new Notice('The two passwords do not match.');
				return;
			}

			this.plugin.settings.passwordHash = await hashPassword(first);
			this.plugin.settings.enabled = true;
			await this.plugin.saveSettings();

			firstInput.value = '';
			secondInput.value = '';
			new Notice('Password saved.');
			this.display();
		});

		// ---------- Auto lock ----------
		new Setting(containerEl).setName('Auto lock').setHeading();

		new Setting(containerEl)
			.setName('Idle lock time')
			.setDesc('Lock automatically after this many minutes without activity. Set to 0 to disable.')
			.addSlider((slider) =>
				slider
					.setLimits(0, 60, 1)
					.setValue(this.plugin.settings.autoLockMinutes)
					.setDynamicTooltip()
					.setTooltip(`${this.plugin.settings.autoLockMinutes} minutes`)
					.onChange(async (value) => {
						this.plugin.settings.autoLockMinutes = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Lock when switching windows')
			.setDesc('Lock when you switch to another window or minimize Obsidian.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.lockOnWindowSwitch).onChange(async (value) => {
					this.plugin.settings.lockOnWindowSwitch = value;
					await this.plugin.saveSettings();
				}),
			);

		// ---------- Test ----------
		new Setting(containerEl)
			.setName('Test lock screen')
			.setDesc('Lock the vault now to preview the password screen.')
			.addButton((button) =>
				button.setButtonText('Lock now').setCta().onClick(() => this.plugin.lock()),
			);
	}
}
