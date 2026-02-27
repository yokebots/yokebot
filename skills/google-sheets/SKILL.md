---
name: Google Sheets
description: Read and write data to Google Sheets for reporting and data management
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use `sheets_read` to fetch data from a Google Sheets spreadsheet and `sheets_write` to update cells. Useful for generating reports, syncing CRM data, or managing inventory.

Specify the spreadsheet by its ID (from the URL) and the range in A1 notation (e.g. "Sheet1!A1:D10").

Requires Google Sheets API credentials to be configured.

## Tools

```tools
[
  {
    "name": "sheets_read",
    "description": "Read data from a Google Sheets spreadsheet.",
    "parameters": {
      "type": "object",
      "properties": {
        "spreadsheetId": { "type": "string", "description": "The spreadsheet ID from the URL" },
        "range": { "type": "string", "description": "The A1 notation range, e.g. Sheet1!A1:D10" }
      },
      "required": ["spreadsheetId", "range"]
    }
  },
  {
    "name": "sheets_write",
    "description": "Write data to a Google Sheets spreadsheet.",
    "parameters": {
      "type": "object",
      "properties": {
        "spreadsheetId": { "type": "string", "description": "The spreadsheet ID from the URL" },
        "range": { "type": "string", "description": "The A1 notation range to write to" },
        "values": { "type": "array", "description": "2D array of values to write", "items": { "type": "array", "items": { "type": "string" } } }
      },
      "required": ["spreadsheetId", "range", "values"]
    }
  }
]
```
