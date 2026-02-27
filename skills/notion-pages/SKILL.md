---
name: Notion Pages
description: Create and update pages in Notion workspaces
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [notion]
---

## Instructions

Use the `notion_create_page` tool to create and update pages in Notion. Add content to databases, create standalone pages, or update existing page properties and content blocks.

Structure content with headings, lists, and callouts for readability. Match the existing database schema when adding to databases.

## Tools

```tools
[
  {
    "name": "notion_create_page",
    "description": "Create or update a page in Notion.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action: 'create', 'update', 'search'" },
        "parentId": { "type": "string", "description": "Parent page or database ID (for create)" },
        "title": { "type": "string", "description": "Page title" },
        "content": { "type": "string", "description": "Page content in markdown format" },
        "properties": { "type": "string", "description": "JSON string of database properties (for database entries)" },
        "pageId": { "type": "string", "description": "Page ID (for update)" },
        "query": { "type": "string", "description": "Search query (for search action)" }
      },
      "required": ["action"]
    }
  }
]
```
