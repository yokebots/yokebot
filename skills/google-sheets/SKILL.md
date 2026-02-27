---
name: Google Sheets
description: Read, write, and manage Google Sheets spreadsheets
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: [google]
---

## Instructions

Use the `google_sheets` tool to read data from and write data to Google Sheets. Query specific ranges, append rows, create new sheets, and update cell values.

Reference cells using A1 notation. Preserve existing data when writing to shared sheets.

## Tools

```tools
[
  {
    "name": "google_sheets",
    "description": "Read and write data in Google Sheets.",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action: 'read', 'write', 'append', 'create'" },
        "spreadsheetId": { "type": "string", "description": "Google Sheets spreadsheet ID" },
        "range": { "type": "string", "description": "Cell range in A1 notation (e.g., 'Sheet1!A1:D10')" },
        "values": { "type": "string", "description": "JSON array of row arrays for write/append (e.g., '[[\"Name\",\"Email\"],[\"John\",\"john@co.com\"]]')" },
        "title": { "type": "string", "description": "Spreadsheet title (for create action)" }
      },
      "required": ["action"]
    }
  }
]
```
