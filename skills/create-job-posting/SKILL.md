---
name: Create Job Posting
description: Write compelling job descriptions from role requirements
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `create_job_posting` tool to write professional job descriptions. Provide the role details and requirements, and it generates an engaging posting with responsibilities, qualifications, benefits, and company culture highlights.

Write inclusive language. Be specific about requirements vs. nice-to-haves.

## Tools

```tools
[
  {
    "name": "create_job_posting",
    "description": "Write a professional job posting from role requirements.",
    "parameters": {
      "type": "object",
      "properties": {
        "title": { "type": "string", "description": "Job title" },
        "requirements": { "type": "string", "description": "Key requirements, skills, and qualifications" },
        "department": { "type": "string", "description": "Department or team" },
        "location": { "type": "string", "description": "Location: 'remote', 'hybrid', or specific location (default: remote)" },
        "companyInfo": { "type": "string", "description": "Brief company description and culture highlights (optional)" }
      },
      "required": ["title", "requirements"]
    }
  }
]
```
