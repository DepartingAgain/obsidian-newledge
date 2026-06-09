type PropertyValue = string | string[];
type PropertyData = Record<string, PropertyValue>;

function asString(value: PropertyValue | undefined): string {
	if (Array.isArray(value)) {
		return value.join(", ");
	}

	return value ?? "";
}

function asStringList(value: PropertyValue | undefined): string[] {
	if (Array.isArray(value)) {
		return value;
	}

	return value ? [value] : [];
}

function renderTagList(tags: string[]): string {
	return tags.map((tag) => `  - ${tag}`).join("\n");
}

export function renderRichTextProperty(data: PropertyData): string {
	const relatedContent = asString(data.relatedContent).trim();
	const lines = ["---"];

	if (relatedContent) {
		lines.push(`关联内容: "[[${relatedContent}]]"`);
	}

	lines.push(`创建时间: "${asString(data.createTime)}"`);
	lines.push(`关联日记: "[[${asString(data.relatedDiary)}]]"`);
	lines.push("tags:");
	lines.push(renderTagList(asStringList(data.obsidianTagList)));
	lines.push("---");

	return lines.join("\n");
}

export function renderLinkProperty(data: PropertyData): string {
	const lines = ["---", "作者:"];

	for (const author of asStringList(data.authorList)) {
		lines.push(`  - "${author}"`);
	}

	lines.push(`原文链接: ${asString(data.link)}`);
	lines.push(`发布时间: "${asString(data.publishTime)}"`);
	lines.push(`收藏时间: "${asString(data.collectTime)}"`);
	lines.push(`关联日记: "[[${asString(data.relatedDiary)}]]"`);
	lines.push("tags:");
	lines.push(renderTagList(asStringList(data.obsidianTagList)));
	lines.push("---");

	return lines.join("\n");
}

export function renderText(data: {
	propertiesText: string;
	text: string[];
	tagList: string[];
}): string {
	const lines = [data.propertiesText, ...data.text, ""];

	if (data.tagList.length > 0) {
		lines.push(
			`新枝标签： ${data.tagList
				.map((tag) => `#${tag}`)
				.join(" ")}`
		);
	}

	return lines.join("\n");
}
