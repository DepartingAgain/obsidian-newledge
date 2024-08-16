import * as ejs from "ejs";

const richTextPropertyTemplate = `---
<% if (typeof relatedContent !== 'undefined' && relatedContent !== null && relatedContent.trim() !== '') { -%>
关联内容: "[[<%= relatedContent %>]]"
<% } -%>
创建时间: "<%= createTime %>"
关联日记: "[[<%= relatedDiary %>]]"
tags:
<% obsidianTagList.forEach(function(tag){ -%>
  - <%= tag %>
<% }); -%>
---`;

const linkPropertyTemplate = `---
作者:
<% authorList.forEach(function(author){ -%>
  - "<%= author %>"
<% }); -%>
原文链接: <%= link %>
发布时间: "<%= publishTime %>"
收藏时间: "<%= collectTime %>"
关联日记: "[[<%= relatedDiary %>]]"
tags:
<% obsidianTagList.forEach(function(tag){ -%>
  - <%= tag %>
<% }); -%>
---`;

const textTemplate = `<%- propertiesText %><% text.forEach(function(block){ %>
<%- block %>
<% }); %>
<% if (tagList && tagList.length > 0) { %>
新枝标签： <% tagList.forEach(function(tag, index){ %>#<%= tag %><%= index < tagList.length - 1 ? ' ' : '' %><% }); %>
<% } %>`;

export function renderRichTextProperty(
	data: Record<string, string[] | string>
) {
	return ejs.render(richTextPropertyTemplate, data);
}

export function renderLinkProperty(data: Record<string, string[] | string>) {
	return ejs.render(linkPropertyTemplate, data);
}

export function renderText(data: {
	propertiesText: string;
	text: string[];
	tagList: string[];
}) {
	return ejs.render(textTemplate, data);
}
