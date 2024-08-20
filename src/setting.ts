import { App, Notice, PluginSettingTab, Setting } from "obsidian";
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

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h1", { text: "新枝Newledge" });

		const { valid: accountValid, failedTaskCount } =
			await this.plugin.checkAccount();

		if (accountValid) {
			this.renderSetting(failedTaskCount);
		} else {
			this.renderLogin();
		}
	}

	async renderLogin() {
		const { containerEl } = this;

		let sessionId = "";
		try {
			sessionId = await this._getSessionId();
		} catch (error) {
			// 极端情况，此时用户需要重新启用插件
			return;
		}

		const qrCodeSetting = new Setting(containerEl)
			.setName("扫描二维码绑定新枝账户")
			.setDesc("后花园 > 数据联动 > 同步到 Obsidian");

		this.renderQrCodeSetting(sessionId, qrCodeSetting);
	}

	async renderQrCodeSetting(sessionId: string, qrCodeSetting: Setting) {
		const qrCodeValueDom = this._createQrCodeElement(sessionId);

		qrCodeSetting.settingEl.appendChild(qrCodeValueDom);

		const loginResponse = await this._getLoginStatus(sessionId);

		if (loginResponse.qrCodeExpired) {
			const expiredGuideDom = document.createElement("div");
			expiredGuideDom.className = "newledge-qrcode-expired-guide";
			expiredGuideDom.onclick = async () => {
				qrCodeValueDom.remove();
				this.renderQrCodeSetting(
					await this._getSessionId(),
					qrCodeSetting
				);
			};

			const expiredTextDom = document.createElement("div");
			expiredTextDom.setText("二维码已过期\n点击刷新");
			expiredGuideDom.appendChild(expiredTextDom);

			qrCodeValueDom.appendChild(expiredGuideDom);
		} else if (loginResponse.status && loginResponse.token) {
			this.plugin.settings.token = loginResponse.token;
			this.plugin.settings.user = {
				id: loginResponse.id!,
				name: loginResponse.name || "新枝用户",
			};
			this.plugin.settings.sessionId = sessionId;
			await this.plugin.saveSettings();

			await this.display();

			await this.plugin.sync();
		}
	}

	async renderSetting(failedTaskCount: number = 0) {
		const { containerEl } = this;

		const userInfo = this.plugin.settings.user!;
		const token = this.plugin.settings.token!;

		const accountSetting = new Setting(containerEl)
			.setName("账号: " + userInfo.name)
			.setDesc("30天内重新绑定不会同步已同步过的数据");
		accountSetting.addButton((button) => {
			button
				.setButtonText("解绑")
				.setClass("mod-warning")
				.setClass("newledge-button")
				.onClick(async () => {
					try {
						await unbind(token);
					} catch (error) {
						new Notice("新枝: 出错啦, 请稍后重试");
						return;
					}

					this.plugin.settings.token = null;
					this.plugin.settings.user = null;
					this.plugin.settings.sessionId = null;
					await this.plugin.saveSettings();

					this.display();
				});
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
					.onChange(async (val) => {
						this.plugin.settings.syncInterval = parseInt(val, 10);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("立即同步")
			.setDesc("立即从新枝同步数据到 Obsidian 中")
			.addButton((button) => {
				button
					.setButtonText("立即同步")
					.setClass("newledge-button")
					.onClick(async () => {
						if (this.plugin.settings.syncing) {
							new Notice("新枝: 正在同步中...");
							return;
						}

						await this.plugin.sync();
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
						.onClick(async () => {
							try {
								await retry(token);
							} catch (error) {
								new Notice("新枝: 出错啦, 请稍后重试");
								return;
							}

							button.setButtonText("重试中...");
							button.setDisabled(true);

							if (this.plugin.settings.syncing) {
								new Notice(
									"新枝: 正在同步中, 将在本次同步完成后重试失败内容"
								);
							} else {
								await this.plugin.sync();
								containerEl.removeChild(
									containerEl.children[
										containerEl.children.length - 1
									]
								);
							}
						});
				});
		}
	}

	private _createQrCodeElement(sessionId: string) {
		const qrCodeValueDom = document.createElement("div");
		qrCodeValueDom.className = "newledge-qrcode-wrapper";
		const canvas = document.createElement("canvas");
		qrCodeValueDom.appendChild(canvas);

		QRCode.toCanvas(canvas, sessionId, {
			width: 100,
		});

		return qrCodeValueDom;
	}

	private async _getLoginStatus(
		sessionId: string
	): Promise<LoginStatus & { qrCodeExpired?: boolean }> {
		return new Promise((resolve) => {
			let attempts = 1;
			const maxAttempts = 60;

			const intervalId = this.plugin.registerInterval(
				window.setInterval(async () => {
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
					} catch (error) {
						// doNothing
					}

					attempts++;
				}, 2000)
			);
		});
	}

	private async _getSessionId() {
		const { sessionId } = await getSessionId();
		return sessionId;
	}
}
