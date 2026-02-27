---
name: Scan Dependencies
description: Analyze project dependencies for known vulnerabilities
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `scan_dependencies` tool to analyze package manifests (package.json, requirements.txt, Gemfile, etc.) for known security vulnerabilities. Returns a list of affected packages with severity ratings and remediation advice.

Prioritize critical and high severity issues. Suggest specific version upgrades to resolve vulnerabilities.

## Tools

```tools
[
  {
    "name": "scan_dependencies",
    "description": "Scan project dependencies for known security vulnerabilities.",
    "parameters": {
      "type": "object",
      "properties": {
        "manifest": { "type": "string", "description": "Contents of the dependency manifest file (package.json, requirements.txt, etc.)" },
        "manifestType": { "type": "string", "description": "Type: 'npm', 'pip', 'gem', 'cargo', 'go' (auto-detected if omitted)" },
        "severityThreshold": { "type": "string", "description": "Minimum severity to report: 'low', 'medium', 'high', 'critical' (default: medium)" }
      },
      "required": ["manifest"]
    }
  }
]
```
