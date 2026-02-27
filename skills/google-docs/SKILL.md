---
name: Google Docs
description: Create and edit documents via Google Docs API
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [google]
---

## Instructions

Use the `google_docs` tool to create and edit Google Docs. Create new documents, append content, or read existing documents for processing and analysis.

Structure documents with clear headings and formatting. Preserve existing content when appending.

## Tools

```tools
[
  {
    "name": "google_docs",
    "description": "Create and manage Google Docs documents.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action: 'create', 'read', 'append', 'search'" },
        "title": { "type": "string", "description": "Document title (for create)" },
        "content": { "type": "string", "description": "Content in markdown format (for create/append)" },
        "documentId": { "type": "string", "description": "Google Doc ID (for read/append)" },
        "query": { "type": "string", "description": "Search query to find documents (for search)" },
        "folderId": { "type": "string", "description": "Google Drive folder ID to create in (optional)" }
      },
      "required": ["action"]
    }
  }
]
```
