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

		const { valid } = await this.checkAccount();
		if (valid) {
			await this._initDir();

			await this.sync();

			this.registerInterval(
				window.setInterval(async () => {
					await this._timingSync();
				}, minute)
			);
		}
	}

	async onunload() {
		this.settings.syncing = false;
		this.settings.enable = false;
		await this.saveSettings();
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
			} catch (error) {
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
					} catch (error) {
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
		} catch (error) {
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
		const adapter = this.app.vault.adapter;
		const { rootDir, linkDir, richTextDir } = this.settings;

		const dirsToCreate = [
			rootDir,
			`${rootDir}/${linkDir}`,
			`${rootDir}/${richTextDir}`,
		];

		for (const dir of dirsToCreate) {
			if (!(await adapter.exists(dir))) {
				await adapter.mkdir(dir);
			}
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

			const title = normalizePath(noteTitle);

			let fileName = "";
			if (superType === "SUPER_LINK") {
				const dir = `${rootDir}/${linkDir}/${title}`;
				if (!(await adapter.exists(dir))) {
					await adapter.mkdir(dir);
				}
				fileName = await this._getFileName(`${dir}/${title}`);
			} else if (superType === "SUPER_RICH_TEXT") {
				if (
					(noteType === "HIGHLIGHT" || noteType === "ANNOTATION") &&
					relatedContentTitle &&
					relatedContentSuperType === "SUPER_LINK"
				) {
					const relatedContentDir = `${rootDir}/${linkDir}/${relatedContentTitle}`;
					if (!(await adapter.exists(relatedContentDir))) {
						await adapter.mkdir(relatedContentDir);
					}

					fileName = await this._getFileName(
						`${relatedContentDir}/${title}`
					);
				} else {
					fileName = await this._getFileName(
						`${rootDir}/${richTextDir}/${title}`
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
			} catch (error) {
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
			} catch (error) {
				// doNothing
			}
			throw error;
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
		} catch (error) {
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
