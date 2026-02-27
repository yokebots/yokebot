---
name: Audit Permissions
description: Review access permissions and security configurations
tags: [Analysis]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `audit_permissions` tool to review and report on access permissions and security configurations. Analyze permission structures and identify overly permissive access, unused accounts, or policy violations.

Flag high-risk findings first. Recommend specific remediations following the principle of least privilege.

## Tools

```tools
[
  {
    "name": "audit_permissions",
    "description": "Review access permissions and security configurations.",
    "parameters": {
      "type": "object",
      "properties": {
        "config": { "type": "string", "description": "Permission configuration, access control list, or security policy to audit" },
        "configType": { "type": "string", "description": "Type: 'iam', 'file-system', 'database', 'api', 'general' (default: general)" },
        "standard": { "type": "string", "description": "Compliance standard to check against: 'soc2', 'gdpr', 'hipaa', 'general' (default: general)" }
      },
      "required": ["config"]
    }
  }
]
```
