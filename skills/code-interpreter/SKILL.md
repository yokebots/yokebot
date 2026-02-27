---
name: Code Interpreter
description: Execute Python code in a sandboxed environment for data analysis and computation
tags: [Tools]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `run_python` tool when the user asks you to perform calculations, data analysis, generate charts, or process structured data. Write clean, readable Python code.

The sandbox has access to common libraries: `json`, `math`, `datetime`, `csv`, `re`, and `statistics`. No network access or file system access outside the sandbox.

## Tools

```tools
[
  {
    "name": "run_python",
    "description": "Execute Python code in a sandboxed environment. Returns stdout output.",
    "parameters": {
      "type": "object",
      "properties": {
        "code": { "type": "string", "description": "The Python code to execute" }
      },
      "required": ["code"]
    }
  }
]
```
