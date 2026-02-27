---
name: Browser Use
description: Browse the web, interact with web apps, fill forms, extract data
tags: [Tools, Browser]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the browser tools to interact with websites and web applications. Start by navigating to a URL with `browser_navigate`, then use `browser_snapshot` to see what's on the page. Click elements, type into fields, and extract data using the accessibility tree — no screenshots needed.

Always start with `browser_navigate` followed by `browser_snapshot`. Use accessibility refs from the snapshot to interact with specific elements. Close the browser session when done to free resources.

## Tools

```tools
[
  {
    "name": "browser_navigate",
    "description": "Navigate to a URL in the browser.",
    "parameters": {
      "type": "object",
      "properties": {
        "url": { "type": "string", "description": "The URL to navigate to" }
      },
      "required": ["url"]
    }
  },
  {
    "name": "browser_snapshot",
    "description": "Get the current page's accessibility tree (structured text representation of visible elements). Use this to see what's on the page.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "browser_click",
    "description": "Click an element on the page by its accessibility ref (from browser_snapshot).",
    "parameters": {
      "type": "object",
      "properties": {
        "ref": { "type": "string", "description": "Accessibility ref of the element to click (from snapshot)" }
      },
      "required": ["ref"]
    }
  },
  {
    "name": "browser_type",
    "description": "Type text into an input field identified by accessibility ref.",
    "parameters": {
      "type": "object",
      "properties": {
        "ref": { "type": "string", "description": "Accessibility ref of the input element" },
        "text": { "type": "string", "description": "Text to type" },
        "submit": { "type": "boolean", "description": "Press Enter after typing (default: false)" }
      },
      "required": ["ref", "text"]
    }
  },
  {
    "name": "browser_select_option",
    "description": "Select an option from a dropdown/select element.",
    "parameters": {
      "type": "object",
      "properties": {
        "ref": { "type": "string", "description": "Accessibility ref of the select element" },
        "value": { "type": "string", "description": "Value or label of the option to select" }
      },
      "required": ["ref", "value"]
    }
  },
  {
    "name": "browser_press_key",
    "description": "Press a keyboard key (Enter, Tab, Escape, ArrowDown, etc.).",
    "parameters": {
      "type": "object",
      "properties": {
        "key": { "type": "string", "description": "Key to press (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown')" }
      },
      "required": ["key"]
    }
  },
  {
    "name": "browser_evaluate",
    "description": "Execute JavaScript on the current page and return the result.",
    "parameters": {
      "type": "object",
      "properties": {
        "expression": { "type": "string", "description": "JavaScript expression to evaluate" }
      },
      "required": ["expression"]
    }
  },
  {
    "name": "browser_close",
    "description": "Close the browser session and free resources.",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  }
]
```
