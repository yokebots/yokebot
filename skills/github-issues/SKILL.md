---
name: GitHub Issues
description: Create, list, and update GitHub issues and pull requests
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [github]
---

## Instructions

Use the `github_issues` tool to manage GitHub issues and pull requests. Create new issues, list open issues, add comments, and update labels or assignees across repositories.

Include clear titles and descriptions when creating issues. Use labels for categorization.

## Tools

```tools
[
  {
    "name": "github_issues",
    "description": "Manage GitHub issues and pull requests.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action: 'list', 'create', 'comment', 'update'" },
        "repo": { "type": "string", "description": "Repository in owner/repo format (e.g., 'acme/website')" },
        "title": { "type": "string", "description": "Issue title (for create)" },
        "body": { "type": "string", "description": "Issue body or comment text" },
        "labels": { "type": "string", "description": "Comma-separated labels (for create/update)" },
        "issueNumber": { "type": "number", "description": "Issue number (for comment/update)" },
        "state": { "type": "string", "description": "Filter by state: 'open', 'closed', 'all' (for list, default: open)" }
      },
      "required": ["action", "repo"]
    }
  }
]
```
