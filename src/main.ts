import { normalizePath, Notice, Plugin } from "obsidian";
import NewledgeSettingTab, {
	DEFAULT_SETTINGS,
	NewledgeSettings,
} from "./setting";
import {
	getIntegration,
	getSyncContent,
	getSyncTask,
	syncFailed,
	syncSuccess,
} from "./service";
import {
	renderLinkProperty,
	renderRichTextProperty,
	renderText,
} from "./template";
import { jwtDecode } from "jwt-decode";

const minute = 60000;

export default class Newledge extends Plugin {
	settings: NewledgeSettings;

	getNormalizedRootDir(): string {
		return this._normalizeRootDir(this.settings.rootDir);
	}

	async ensureRootDirExists(): Promise<string> {
		const normalizedRootDir = this.getNormalizedRootDir();
		await this._ensureDir(normalizedRootDir);

		if (this.settings.rootDir !== normalizedRootDir) {
			this.settings.rootDir = normalizedRootDir;
			await this.saveSettings();
		}

		return normalizedRootDir;
	}

	async ensureDirExists(dir: string): Promise<string> {
		const normalizedDir = this._normalizeRootDir(dir);
		await this._ensureDir(normalizedDir);
		return normalizedDir;
	}

	/**
	 * obsidian 启动时调用
	 * 插件启用时调用
	 */
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new NewledgeSettingTab(this.app, this));

		if (this.settings.syncing) {
			this.settings.syncing = false;
			await this.saveSettings();
		}

		this.settings.enable = true;
		await this.saveSettings();

		this.app.workspace.onLayoutReady(() => {
			void this._initializeSync();
		});
	}

	onunload() {
		this.settings.syncing = false;
		this.settings.enable = false;
		void this.saveSettings();
	}

	private async _initializeSync(): Promise<void> {
		try {
			const { valid } = await this.checkAccount();
			if (valid) {
				await this._initDir();

				void this.sync();

				this.registerInterval(
					window.setInterval(() => {
						void this._timingSync();
					}, minute)
				);
			}
		} catch (_error) {
			// doNothing
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async checkAccount(): Promise<{
		valid: boolean;
		failedTaskCount: number;
	}> {
		const { token, sessionId } = this.settings;
		let tokenValid = false;

		const { format, unExpired } = this._checkToken(token);
		tokenValid = format && unExpired;

		let integrationValid = false;
		let failedTaskCount = 0;
		if (tokenValid && token && sessionId) {
			try {
				const integrationValidResponse = await getIntegration(
					sessionId,
					token
				);
				integrationValid = integrationValidResponse.valid;
				failedTaskCount = integrationValidResponse.failedTaskCount;
			} catch (_error) {
				return {
					valid: false,
					failedTaskCount: 0,
				};
			}
		}

		if (!tokenValid || !integrationValid) {
			this.settings.token = null;
			this.settings.user = null;
			this.settings.sessionId = null;
			await this.saveSettings();
		}

		return {
			valid: tokenValid && integrationValid,
			failedTaskCount: failedTaskCount,
		};
	}

	async sync(message: boolean = true) {
		try {
			const { token, syncing } = this.settings;
			if (!token) {
				return;
			}

			if (syncing) {
				return;
			}

			this.settings.syncing = true;
			await this.saveSettings();

			await this._initDir();

			let hasMore = true;

			if (message) {
				new Notice("新枝: 同步开始");
			}

			let count = 0;
			let successCount = 0;
			let failedCount = 0;

			while (hasMore) {
				const { enable } = this.settings;
				if (!enable) {
					new Notice("新枝: 插件已禁用, 不再同步");
					break;
				}

				const syncTaskResponse = await getSyncTask(token);
				const { valid } = syncTaskResponse;
				if (!valid) {
					new Notice("新枝: 已解除绑定, 不再同步");
					break;
				}

				const syncNoteList = syncTaskResponse.result;

				if (syncNoteList.length === 0) {
					break;
				}

				for (const item of syncNoteList) {
					count++;
					try {
						const { syncSuccess, taskExist, pluginEnable } =
							await this._syncNote(item.id, token);

						if (!pluginEnable) {
							// 同步过程中，禁用插件，立即退出同步
							break;
						}

						if (!taskExist) {
							// 在集成还没被删除时进入当前循环，syncNoteList 遍历过程中，实际上任务均已不存在
							// 当出现一个任务不存在时，就退出当前循环
							break;
						}

						if (syncSuccess) {
							successCount++;
						} else {
							break;
						}
					} catch (_error) {
						failedCount++;
					} finally {
						await sleep(3000);
					}
				}

				hasMore = syncNoteList.length === syncTaskResponse.limit;
			}

			if (count === 0) {
				await sleep(1000);
				new Notice("新枝: 暂无数据需要同步");
			} else {
				let message = `新枝: 同步完成, 成功同步 ${successCount} 篇内容`;
				if (failedCount > 0) {
					message += `, ${failedCount} 篇内容同步失败, 请重试`;
				}

				new Notice(message);
			}
		} catch (_error) {
			new Notice("新枝: 同步失败, 请稍后重试");
		}

		this.settings.lastSyncTime = new Date();
		this.settings.syncing = false;
		await this.saveSettings();
	}

	/**
	 * 初始化相关文件夹
	 */
	private async _initDir() {
		const { linkDir, richTextDir } = this.settings;
		const normalizedRootDir = await this.ensureRootDirExists();
		const normalizedLinkDir = normalizePath(linkDir);
		const normalizedRichTextDir = normalizePath(richTextDir);

		const dirsToCreate = [
			`${normalizedRootDir}/${normalizedLinkDir}`,
			`${normalizedRootDir}/${normalizedRichTextDir}`,
		];

		for (const dir of dirsToCreate) {
			await this._ensureDir(dir);
		}
	}

	private async _syncNote(
		id: string,
		token: string
	): Promise<{
		pluginEnable: boolean;
		taskExist: boolean;
		syncSuccess: boolean;
	}> {
		try {
			const { rootDir, richTextDir, linkDir, enable } = this.settings;
			const normalizedRootDir = this._normalizeRootDir(rootDir);
			const normalizedLinkDir = normalizePath(linkDir);
			const normalizedRichTextDir = normalizePath(richTextDir);

			if (!enable) {
				return {
					pluginEnable: false,
					taskExist: false,
					syncSuccess: false,
				};
			}

			const adapter = this.app.vault.adapter;

			const syncContentResponse = await getSyncContent(id, token);

			const {
				id: noteId,
				title: noteTitle,
				superType,
				properties,
				text,
				tagList,
				noteType,
				relatedContentTitle,
				relatedContentSuperType,
			} = syncContentResponse;

			if (noteId == null) {
				return {
					pluginEnable: true,
					taskExist: false,
					syncSuccess: false,
				};
			}

			const normalizedTitle = this._normalizeTitle(noteTitle);

			let fileName = "";
			if (superType === "SUPER_LINK") {
				const dir = `${normalizedRootDir}/${normalizedLinkDir}/${normalizedTitle}`;
				await this._ensureDir(dir);
				fileName = await this._getFileName(`${dir}/${normalizedTitle}`);
			} else if (superType === "SUPER_RICH_TEXT") {
				if (
					(noteType === "HIGHLIGHT" || noteType === "ANNOTATION") &&
					relatedContentTitle &&
					relatedContentSuperType === "SUPER_LINK"
				) {
					const normalizedRelatedContentTitle =
						this._normalizeTitle(relatedContentTitle);
					const relatedContentDir = `${normalizedRootDir}/${normalizedLinkDir}/${normalizedRelatedContentTitle}`;
					await this._ensureDir(relatedContentDir);

					fileName = await this._getFileName(
						`${relatedContentDir}/${normalizedTitle}`
					);
				} else {
					fileName = await this._getFileName(
						`${normalizedRootDir}/${normalizedRichTextDir}/${normalizedTitle}`
					);
				}
			}

			const propertiesObj: Record<string, string | string[]> = {};
			for (const { key, value } of properties) {
				propertiesObj[key] = value;
			}
			const propertiesText =
				superType === "SUPER_RICH_TEXT"
					? renderRichTextProperty(propertiesObj)
					: renderLinkProperty(propertiesObj);

			const noteText = renderText({ propertiesText, text, tagList });

			await adapter.write(fileName, noteText);

			try {
				await syncSuccess(id, token);
			} catch (_error) {
				// doNothing
			}

			return {
				pluginEnable: true,
				taskExist: true,
				syncSuccess: true,
			};
		} catch (error) {
			try {
				await syncFailed(id, token, error.toString());
			} catch (_error) {
				// doNothing
			}
			throw error;
		}
	}

	private _normalizeTitle(title: string) {
		let sanitized = title
			// 移除控制字符
			.split("")
			.filter((char) => {
				const code = char.charCodeAt(0);
				return code > 31 && (code < 127 || code > 159);
			})
			.join("")
			// 替换Windows不允许的字符
			.replace(/[<>:"/\\|?*]/g, "_")
			// 将多个空格替换为单个空格
			.replace(/\s+/g, " ")
			// 移除首尾空格
			.trim();

		// 限制文件名长度
		const MAX_LENGTH = 100;
		if (sanitized.length > MAX_LENGTH) {
			sanitized = sanitized.slice(0, MAX_LENGTH);
		}

		// 确保文件名不为空
		if (sanitized.length === 0) {
			sanitized = "暂无标题";
		}

		return normalizePath(sanitized);
	}

	private _normalizeRootDir(rootDir: string) {
		const safeRootDir = typeof rootDir === "string" ? rootDir : "";
		const normalized = normalizePath(safeRootDir.trim());
		if (!normalized || normalized === ".") {
			return DEFAULT_SETTINGS.rootDir;
		}

		// 仅允许 vault 内相对路径，禁止绝对路径和越界路径
		const isAbsolutePath =
			normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized);
		if (isAbsolutePath) {
			return DEFAULT_SETTINGS.rootDir;
		}

		const segments = normalized.split("/").filter(Boolean);
		if (segments.length === 0 || segments.some((segment) => segment === "..")) {
			return DEFAULT_SETTINGS.rootDir;
		}

		return normalized;
	}

	private async _ensureDir(dir: string) {
		const adapter = this.app.vault.adapter;
		const normalized = normalizePath(dir);
		if (!normalized || normalized === ".") {
			return;
		}

		const parts = normalized.split("/").filter(Boolean);
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!(await adapter.exists(current))) {
				await adapter.mkdir(current);
			}
		}
	}

	private async _getFileName(name: string) {
		const adapter = this.app.vault.adapter;
		let fileName = `${name}.md`;

		let i = 0;
		while (await adapter.exists(fileName)) {
			i++;
			fileName = `${name} ${i}.md`;
		}

		return fileName;
	}

	private async _timingSync() {
		try {
			const { lastSyncTime, syncInterval, syncing } = this.settings;
			if (syncing) {
				return;
			}

			const sinceLastSyncMillisecond = lastSyncTime
				? new Date().getTime() - lastSyncTime.getTime()
				: 0;

			const syncIntervalMillisecond = syncInterval * minute;
			if (sinceLastSyncMillisecond >= syncIntervalMillisecond) {
				await this.sync();
			}
		} catch (_error) {
			// doNothing
		}
	}

	private _checkToken(token: string | null): {
		format: boolean;
		unExpired: boolean;
	} {
		if (token == undefined || token === null || token === "") {
			return {
				format: false,
				unExpired: false,
			};
		}
		try {
			const result: {
				exp: number;
			} = jwtDecode(token);

			const { exp } = result;
			if (Date.now() >= exp * 1000) {
				return {
					format: true,
					unExpired: false,
				};
			}
			return {
				format: true,
				unExpired: true,
			};
		} catch {
			return {
				format: false,
				unExpired: false,
			};
		}
	}
}
