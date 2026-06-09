import { App, Notice, PluginSettingTab, Setting, TextComponent } from "obsidian";
import * as QRCode from "qrcode";
import Newledge from "./main";
import {
	getLoginStatus,
	getSessionId,
	LoginStatus,
	retry,
	unbind,
} from "./service";

export interface NewledgeSettings {
	token: string | null;
	user: {
		id: string;
		name: string;
	} | null;
	sessionId: string | null;
	// 是否在同步中
	syncing: boolean;
	// 数据存储目录
	rootDir: string;
	richTextDir: string;
	linkDir: string;
	// 同步间隔, 单位分钟
	syncInterval: number;
	// 上次同步时间
	lastSyncTime: Date | null;
	// 插件是否启用
	enable: boolean;
}
export const DEFAULT_SETTINGS: NewledgeSettings = {
	token: null,
	user: null,
	sessionId: null,
	syncing: false,
	rootDir: "新枝",
	richTextDir: "笔记",
	linkDir: "文章",
	syncInterval: 60,
	lastSyncTime: null,
	enable: true,
};

export default class NewledgeSettingTab extends PluginSettingTab {
	plugin: Newledge;

	constructor(app: App, plugin: Newledge) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		void this.displayAsync();
	}

	private async displayAsync(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		const { valid: accountValid, failedTaskCount } =
			await this.plugin.checkAccount();

		if (accountValid) {
			await this.renderSetting(failedTaskCount);
		} else {
			await this.renderLogin();
		}
	}

	async renderLogin() {
		const { containerEl } = this;

		let sessionId = "";
		try {
			sessionId = await this._getSessionId();
		} catch (_error) {
			// 极端情况，此时用户需要重新启用插件
			return;
		}

		const qrCodeSetting = new Setting(containerEl)
			.setName("扫描二维码绑定新枝账户")
			.setDesc("个人页 > 数据联动 > 同步到 Obsidian 桌面端");

		await this.renderQrCodeSetting(sessionId, qrCodeSetting);
	}

	async renderQrCodeSetting(sessionId: string, qrCodeSetting: Setting) {
		const qrCodeValueDom = this._createQrCodeElement(
			qrCodeSetting.settingEl,
			sessionId,
		);

		const loginResponse = await this._getLoginStatus(sessionId);

		if (loginResponse.qrCodeExpired) {
			const expiredGuideDom = qrCodeValueDom.createDiv({
				cls: "newledge-qrcode-expired-guide",
			});
			expiredGuideDom.onclick = () => {
				void this.refreshQrCode(qrCodeValueDom, qrCodeSetting);
			};

			expiredGuideDom.createDiv({
				text: "二维码已过期\n点击刷新",
			});
		} else if (loginResponse.status && loginResponse.token) {
			this.plugin.settings.token = loginResponse.token;
			this.plugin.settings.user = {
				id: loginResponse.id!,
				name: loginResponse.name || "新枝用户",
			};
			this.plugin.settings.sessionId = sessionId;
			await this.plugin.saveSettings();

			await this.displayAsync();

			await this.plugin.sync();
		}
	}

	private async refreshQrCode(
		qrCodeValueDom: HTMLElement,
		qrCodeSetting: Setting,
	): Promise<void> {
		try {
			const sessionId = await this._getSessionId();
			qrCodeValueDom.remove();
			await this.renderQrCodeSetting(sessionId, qrCodeSetting);
		} catch (_error) {
			new Notice("新枝: 出错啦, 请稍后重试");
		}
	}

	async renderSetting(failedTaskCount: number = 0) {
		const { containerEl } = this;

		const userInfo = this.plugin.settings.user!;
		const token = this.plugin.settings.token!;
		const currentRootDir = await this.plugin.ensureRootDirExists();

		const accountSetting = new Setting(containerEl)
			.setName("账号: " + userInfo.name)
			.setDesc("30天内重新绑定不会同步已同步过的数据");
		accountSetting.addButton((button) => {
			button
				.setButtonText("解绑")
				.setClass("mod-warning")
				.setClass("newledge-button")
				.onClick(() => {
					void this.unbindAccount(token);
				});
		});

		new Setting(containerEl)
			.setName("同步目录")
			.setDesc("设置同步内容的根目录（默认：新枝）")
			.addText((text) => {
				text.setPlaceholder("例如：新枝").setValue(currentRootDir);
				this.plugin.registerDomEvent(text.inputEl, "blur", () => {
					void this.updateRootDir(text);
				});
				return text;
			});

		new Setting(containerEl)
			.setName("定时同步")
			.setDesc("每隔一段时间从新枝同步数据到 Obsidian 中")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("60", "1小时")
					.addOption("720", "12小时")
					.addOption("1440", "24小时")
					.setValue(this.plugin.settings.syncInterval.toString())
					.onChange((val) => {
						this.plugin.settings.syncInterval = parseInt(val, 10);
						void this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("立即同步")
			.setDesc("立即从新枝同步数据到 Obsidian 中")
			.addButton((button) => {
				button
					.setButtonText("立即同步")
					.setClass("newledge-button")
					.onClick(() => {
						if (this.plugin.settings.syncing) {
							new Notice("新枝: 正在同步中...");
							return;
						}

						void this.plugin.sync();
					});
			});

		if (failedTaskCount > 0) {
			new Setting(containerEl)
				.setName("重试")
				.setDesc(`有 ${failedTaskCount} 条同步失败的内容, 点击重试`)
				.addButton((button) => {
					button
						.setButtonText("立即重试")
						.setClass("newledge-button")
						.onClick(() => {
							void this.retryFailedTasks(token, button.buttonEl);
						});
				});
		}
	}

	private async unbindAccount(token: string): Promise<void> {
		try {
			await unbind(token);
		} catch (_error) {
			new Notice("新枝: 出错啦, 请稍后重试");
			return;
		}

		this.plugin.settings.token = null;
		this.plugin.settings.user = null;
		this.plugin.settings.sessionId = null;
		await this.plugin.saveSettings();

		await this.displayAsync();
	}

	private async updateRootDir(text: TextComponent): Promise<void> {
		const raw = text.getValue().trim();
		const normalized = this.plugin.getNormalizedRootDir();
		this.plugin.settings.rootDir = raw;
		const safeRootDir = this.plugin.getNormalizedRootDir();

		if (safeRootDir !== raw) {
			new Notice(`新枝: 不支持的路径格式，已恢复为 ${safeRootDir}`);
		} else if (safeRootDir !== normalized) {
			new Notice(`新枝: 同步目录已更新为 ${safeRootDir}`);
		}

		text.setValue(safeRootDir);
		await this.plugin.ensureRootDirExists();
	}

	private async retryFailedTasks(
		token: string,
		buttonEl: HTMLButtonElement,
	): Promise<void> {
		try {
			await retry(token);
		} catch (_error) {
			new Notice("新枝: 出错啦, 请稍后重试");
			return;
		}

		buttonEl.setText("重试中...");
		buttonEl.disabled = true;

		if (this.plugin.settings.syncing) {
			new Notice("新枝: 正在同步中, 将在本次同步完成后重试失败内容");
		} else {
			await this.plugin.sync();
			await this.displayAsync();
		}
	}

	private _createQrCodeElement(parentEl: HTMLElement, sessionId: string) {
		const qrCodeValueDom = parentEl.createDiv({
			cls: "newledge-qrcode-wrapper",
		});
		const canvas = qrCodeValueDom.createEl("canvas");

		void QRCode.toCanvas(canvas, sessionId, {
			width: 100,
		});

		return qrCodeValueDom;
	}

	private async _getLoginStatus(
		sessionId: string,
	): Promise<LoginStatus & { qrCodeExpired?: boolean }> {
		return new Promise((resolve) => {
			let attempts = 1;
			const maxAttempts = 60;

			const intervalId = this.plugin.registerInterval(
				window.setInterval(() => {
					void checkStatus();
				}, 2000),
			);

			const checkStatus = async () => {
					if (attempts >= maxAttempts) {
						window.clearInterval(intervalId);
						resolve({
							qrCodeExpired: true,
							invalidSessionId: true,
							status: false,
							id: null,
							name: null,
							avatar: null,
							token: null,
						});
						return;
					}

					try {
						const loginStatus = await getLoginStatus(sessionId);
						if (loginStatus.invalidSessionId) {
							window.clearInterval(intervalId);
							resolve({
								qrCodeExpired: true,
								invalidSessionId: true,
								status: false,
								id: null,
								name: null,
								avatar: null,
								token: null,
							});
							return;
						}
						if (loginStatus.status && loginStatus.token) {
							window.clearInterval(intervalId);
							resolve(loginStatus);
							return;
						}
					} catch (_error) {
						// doNothing
					}

					attempts++;
			};
		});
	}

	private async _getSessionId() {
		const { sessionId } = await getSessionId();
		return sessionId;
	}
}
