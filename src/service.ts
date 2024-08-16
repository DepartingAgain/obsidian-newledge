import { Notice } from "obsidian";

const domain = "https://api.xinzhi.zone";

const urlPrefix = `${domain}/api/integration/obsidian`;

export interface SessionIdResponse {
	sessionId: string;
}

export interface LoginStatus {
	status: boolean;
	id: string | null;
	name: string | null;
	avatar: string | null;
	token: string | null;
}

export interface SyncTask {
	id: string;
	data: {
		noteId: string;
	};
}

export interface SyncTaskResponse {
	valid: boolean;
	result: SyncTask[];
	limit: number;
}

export interface SyncContentResponse {
	id: string;
	title: string;
	relatedContentTitle: string | null;
	relatedContentSuperType: "SUPER_LINK" | "SUPER_RICH_TEXT" | null;
	tagList: string[];
	noteType: string;
	superType: "SUPER_LINK" | "SUPER_RICH_TEXT";
	text: string[];
	properties: {
		key: string;
		value: string[] | string;
	}[];
}

export interface IntegrationResponse {
	valid: boolean;
	failedTaskCount: number;
}

export async function getSessionId(): Promise<SessionIdResponse> {
	const response = await request("GET", `${urlPrefix}/session-id`);
	return response;
}

export async function getLoginStatus(sessionId: string): Promise<LoginStatus> {
	const response = await request(
		"GET",
		`${urlPrefix}/login-status?sessionId=${sessionId}`
	);

	return response;
}

export async function getSyncTask(token: string): Promise<SyncTaskResponse> {
	const response = await request("GET", `${urlPrefix}/sync-task`, token);
	return response;
}

export async function getSyncContent(
	id: string,
	token: string
): Promise<SyncContentResponse> {
	const response = await request(
		"GET",
		`${urlPrefix}/sync-content?id=${id}`,
		token
	);
	return response;
}

export async function syncSuccess(id: string, token: string): Promise<void> {
	await request("PUT", `${urlPrefix}/sync-success`, token, {
		id,
	});
}

export async function syncFailed(
	id: string,
	token: string,
	error: string
): Promise<void> {
	await request("PUT", `${urlPrefix}/sync-failed`, token, {
		id,
		error,
	});
}

export async function unbind(token: string): Promise<void> {
	await request("DELETE", `${urlPrefix}`, token);
}

export async function getIntegration(
	sessionId: string,
	token: string
): Promise<IntegrationResponse> {
	const response = await request(
		"GET",
		`${urlPrefix}/integration?sessionId=${sessionId}`,
		token
	);
	return response;
}

export async function retry(token: string): Promise<void> {
	await request("PUT", `${urlPrefix}/retry`, token);
}

async function request(
	method: string,
	url: string,
	token?: string,
	body?: any
) {
	const headers = new Headers();
	if (token) {
		headers.set("X-Obsidian-Token", token);
	}
	headers.set("Content-Type", "application/json");

	const options: RequestInit = {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	};

	let response;
	try {
		response = await fetch(url, options);
	} catch (error) {
		new Notice("新枝: 服务异常");
		throw error;
	}

	if (!response.ok) {
		new Notice("新枝: 服务异常");
		throw new Error(response.statusText + " " + response.status);
	}

	const data = await response.json();

	if (data.code === 5000) {
		throw new Error(JSON.stringify(data));
	}

	return data.data;
}
