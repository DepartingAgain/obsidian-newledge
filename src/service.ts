import { Notice, requestUrl, RequestUrlParam } from "obsidian";

const domain = "https://api.xinzhi.zone";

const urlPrefix = `${domain}/api/integration/obsidian`;

export interface SessionIdResponse {
	sessionId: string;
}

export interface LoginStatus {
	status: boolean;
	invalidSessionId: boolean;
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
	const headers: Record<string, string> = {};
	if (token) {
		headers["X-Obsidian-Token"] = token;
	}
	headers["X-Client"] = "Obsidian";

	const options: RequestUrlParam = {
		method,
		contentType: "application/json",
		headers,
		body: body ? JSON.stringify(body) : undefined,
		url,
	};

	let response;
	try {
		response = await requestUrl(options);
	} catch (error) {
		new Notice("新枝: 服务异常");
		throw error;
	}

	if (response.status !== 200) {
		new Notice("新枝: 服务异常");
		throw new Error(response.status + " " + response.text);
	}

	const responseJson = response.json;

	if (responseJson.code !== 1001) {
		throw new Error(JSON.stringify(responseJson));
	}

	return responseJson.data;
}
