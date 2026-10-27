import { App, Plugin, PluginSettingTab, Setting, Modal, Notice, MarkdownView } from 'obsidian';

// ==================== 类型定义 ====================

interface NoteLockSettings {
	passwordHash: string;
	autoLockMinutes: number;
	lockOnScreenSwitch: boolean;
	enabled: boolean;
}

const DEFAULT_SETTINGS: NoteLockSettings = {
	passwordHash: '',
	autoLockMinutes: 5,
	lockOnScreenSwitch: true,
	enabled: false,
}

// ==================== 工具函数 ====================

/** 使用 SHA-256 对密码进行哈希 */
async function hashPassword(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password + 'obsidian-note-lock-salt-v1');
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==================== 锁定弹框 ====================

class LockOverlay {
	private overlayEl: HTMLElement | null = null;
	private inputEl: HTMLInputElement | null = null;
	private errorEl: HTMLElement | null = null;
	private onUnlockSuccess: () => void;
	private plugin: NoteLockPlugin;

	constructor(plugin: NoteLockPlugin, onUnlockSuccess: () => void) {
		this.plugin = plugin;
		this.onUnlockSuccess = onUnlockSuccess;
	}

	open() {
		if (this.overlayEl) return;

		const overlay = document.createElement('div');
		overlay.addClass('note-lock-overlay');
		overlay.innerHTML = `
			<div class="note-lock-card">
				<div class="note-lock-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="#4a90d9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
						<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
					</svg>
				</div>
				<div class="note-lock-title">笔记已锁定</div>
				<div class="note-lock-subtitle">输入密码以解锁查看笔记内容</div>
				<input type="password" class="note-lock-input" placeholder="请输入密码" autocomplete="off" />
				<div class="note-lock-error"></div>
				<button class="note-lock-button">解 锁</button>
			</div>
		`;

		this.overlayEl = overlay;
		this.inputEl = overlay.querySelector('.note-lock-input') as HTMLInputElement;
		this.errorEl = overlay.querySelector('.note-lock-error') as HTMLElement;

		const button = overlay.querySelector('.note-lock-button') as HTMLButtonElement;

		const handleUnlock = async () => {
			await this.tryUnlock();
		};

		button.addEventListener('click', handleUnlock);
		this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				handleUnlock();
			}
		});

		document.body.appendChild(overlay);

		// 自动聚焦输入框
		setTimeout(() => this.inputEl?.focus(), 100);
	}

	private async tryUnlock() {
		if (!this.inputEl || !this.errorEl) return;

		const password = this.inputEl.value;
		if (!password) {
			this.showError('请输入密码');
			return;
		}

		const inputHash = await hashPassword(password);
		if (inputHash === this.plugin.settings.passwordHash) {
			this.close();
			this.onUnlockSuccess();
		} else {
			this.showError('密码错误，请重试');
			this.inputEl.value = '';
			this.inputEl.focus();
			// 抖动效果
			if (this.overlayEl) {
				this.overlayEl.animate([
					{ transform: 'translateX(0)' },
					{ transform: 'translateX(-10px)' },
					{ transform: 'translateX(10px)' },
					{ transform: 'translateX(-10px)' },
					{ transform: 'translateX(0)' },
				], { duration: 300 });
			}
		}
	}

	private showError(msg: string) {
		if (this.errorEl) {
			this.errorEl.textContent = msg;
		}
		if (this.inputEl) {
			this.inputEl.addClass('error');
			setTimeout(() => this.inputEl?.removeClass('error'), 1500);
		}
	}

	close() {
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

// ==================== 插件主类 ====================

export default class NoteLockPlugin extends Plugin {
	settings: NoteLockSettings = DEFAULT_SETTINGS;
	private lockOverlay: LockOverlay | null = null;
	private idleTimer: number | null = null;
	private isLocked: boolean = false;

	async onload() {
		await this.loadSettings();

		// 如果已设置密码且插件启用，启动锁定
		if (this.settings.enabled && this.settings.passwordHash) {
			// 延迟一下，等 Obsidian 完全加载
			setTimeout(() => {
				this.lock();
			}, 500);
		}

		// 添加命令：手动锁定
		this.addCommand({
			id: 'lock-notes',
			name: '立即锁定笔记',
			callback: () => this.lock(),
		});

		// 添加命令：解锁笔记
		this.addCommand({
			id: 'unlock-notes',
			name: '解锁笔记',
			callback: () => {
				if (this.isLocked) {
					// 已经在锁定界面，不需要重复触发
				} else {
					new Notice('笔记当前未锁定');
				}
			},
		});

		// 设置界面
		this.addSettingTab(new NoteLockSettingTab(this.app, this));

		// 监听用户活动，重置空闲计时器
		this.registerDomEvent(document, 'mousemove', () => this.resetIdleTimer());
		this.registerDomEvent(document, 'keydown', () => this.resetIdleTimer());
		this.registerDomEvent(document, 'click', () => this.resetIdleTimer());
		this.registerDomEvent(document, 'scroll', () => this.resetIdleTimer());
		this.registerDomEvent(document, 'touchstart', () => this.resetIdleTimer());

		// 监听窗口失焦 / 切换标签页
		this.registerEvent(
			this.app.workspace.on('window-open', () => this.onWindowSwitch())
		);

		// visibilitychange 事件 - 切换屏幕 / 最小化窗口
		document.addEventListener('visibilitychange', this.handleVisibilityChange);
		this.register(() => {
			document.removeEventListener('visibilitychange', this.handleVisibilityChange);
		});

		// 窗口失焦事件
		window.addEventListener('blur', this.handleWindowBlur);
		this.register(() => {
			window.removeEventListener('blur', this.handleWindowBlur);
		});
	}

	onunload() {
		this.clearIdleTimer();
		this.lockOverlay?.close();
	}

	// ==================== 锁定 / 解锁逻辑 ====================

	lock() {
		if (this.isLocked) return;
		if (!this.settings.passwordHash) {
			new Notice('请先在设置中设置密码');
			return;
		}

		this.isLocked = true;
		this.clearIdleTimer();

		this.lockOverlay = new LockOverlay(this, () => {
			this.isLocked = false;
			this.lockOverlay = null;
			this.resetIdleTimer();
			new Notice('已解锁');
		});
		this.lockOverlay.open();
	}

	unlockWithoutPassword() {
		// 仅用于设置变更时的内部调用
		this.isLocked = false;
		this.lockOverlay?.close();
		this.lockOverlay = null;
	}

	// ==================== 空闲计时器 ====================

	private resetIdleTimer() {
		if (!this.settings.enabled || !this.settings.passwordHash) return;
		if (this.isLocked) return; // 已锁定时不重置

		this.clearIdleTimer();

		if (this.settings.autoLockMinutes > 0) {
			this.idleTimer = window.setTimeout(() => {
				this.lock();
			}, this.settings.autoLockMinutes * 60 * 1000);
		}
	}

	private clearIdleTimer() {
		if (this.idleTimer !== null) {
			window.clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}

	// ==================== 屏幕切换检测 ====================

	private handleVisibilityChange = () => {
		if (document.hidden) {
			this.onScreenSwitch();
		}
	};

	private handleWindowBlur = () => {
		this.onScreenSwitch();
	};

	private onWindowSwitch() {
		this.onScreenSwitch();
	}

	private onScreenSwitch() {
		if (!this.settings.enabled || !this.settings.lockOnScreenSwitch) return;
		if (!this.settings.passwordHash) return;
		if (this.isLocked) return;

		// 延迟一点，避免切换回来的瞬间也触发
		setTimeout(() => {
			if (document.hidden || !document.hasFocus()) {
				this.lock();
			}
		}, 300);
	}

	// ==================== 设置加载 ====================

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// ==================== 设置面板 ====================

class NoteLockSettingTab extends PluginSettingTab {
	plugin: NoteLockPlugin;

	constructor(app: App, plugin: NoteLockPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 启用开关
		new Setting(containerEl)
			.setName('启用笔记加锁')
			.setDesc('开启后，启动 Obsidian 或触发锁定条件时将显示密码锁')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enabled)
				.onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
					if (!value) {
						this.plugin.unlockWithoutPassword();
					}
					this.display();
				}));

		// 状态显示
		const hasPassword = !!this.plugin.settings.passwordHash;
		new Setting(containerEl)
			.setName('密码状态')
			.setDesc(hasPassword ? '已设置密码' : '尚未设置密码')
			.addExtraButton(btn => btn
				.setIcon(hasPassword ? 'check-circle' : 'x-circle')
				.setTooltip(hasPassword ? '密码已配置' : '请设置密码')
				.setDisabled(true));

		containerEl.createEl('hr', { cls: 'setting-item-separator' });

		// 设置密码
		const setPwdDiv = containerEl.createDiv('note-lock-set-password');

		new Setting(setPwdDiv)
			.setName('设置 / 修改密码')
			.setDesc('输入新密码以设置或更换锁定密码');

		const pwdInput1 = setPwdDiv.createEl('input', {
			type: 'password',
			cls: 'note-lock-input',
			attr: { placeholder: '输入新密码' },
		});

		const pwdInput2 = setPwdDiv.createEl('input', {
			type: 'password',
			cls: 'note-lock-input',
			attr: { placeholder: '确认新密码' },
		});

		const savePwdBtn = setPwdDiv.createEl('button', {
			text: '保存密码',
			cls: 'mod-cta',
		});

		savePwdBtn.addEventListener('click', async () => {
			const pwd1 = pwdInput1.value;
			const pwd2 = pwdInput2.value;

			if (!pwd1) {
				new Notice('密码不能为空');
				return;
			}
			if (pwd1.length < 4) {
				new Notice('密码至少 4 位');
				return;
			}
			if (pwd1 !== pwd2) {
				new Notice('两次输入的密码不一致');
				return;
			}

			this.plugin.settings.passwordHash = await hashPassword(pwd1);
			this.plugin.settings.enabled = true;
			await this.plugin.saveSettings();

			pwdInput1.value = '';
			pwdInput2.value = '';
			new Notice('密码设置成功');
			this.display();
		});

		containerEl.createEl('hr', { cls: 'setting-item-separator' });

		// 自动锁定时间
		new Setting(containerEl)
			.setName('自动锁定时间')
			.setDesc('多少分钟无操作后自动锁定笔记（设为 0 则不自动锁定）')
			.addSlider(slider => slider
				.setLimits(0, 60, 1)
				.setValue(this.plugin.settings.autoLockMinutes)
				.setDynamicTooltip()
				.setTooltip(`${this.plugin.settings.autoLockMinutes} 分钟`)
				.onChange(async (value) => {
					this.plugin.settings.autoLockMinutes = value;
					await this.plugin.saveSettings();
				}));

		// 屏幕切换锁定
		new Setting(containerEl)
			.setName('切换屏幕后自动锁定')
			.setDesc('切换到其他窗口 / 最小化 Obsidian 时自动锁定')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.lockOnScreenSwitch)
				.onChange(async (value) => {
					this.plugin.settings.lockOnScreenSwitch = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('hr', { cls: 'setting-item-separator' });

		// 手动锁定按钮
		new Setting(containerEl)
			.setName('立即测试')
			.setDesc('点击立即锁定，测试密码锁效果')
			.addButton(btn => btn
				.setButtonText('立即锁定')
				.setCta()
				.onClick(() => {
					this.plugin.lock();
				}));
	}
}
