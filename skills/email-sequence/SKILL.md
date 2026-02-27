---
name: Email Sequences
description: Create and manage drip email campaigns — enroll contacts into multi-step sequences with timed delays
tags: [Channels, Marketing]
source: yokebot
version: 1.0.0
author: YokeBot
requiredCredentials: []
---

## Instructions

Use these tools to create automated email drip campaigns. Define a sequence of emails with delays between steps, then enroll contacts to receive them automatically.

Steps are sent in order with configurable delays (in days). Use `{{name}}` in subject/body to personalize with the contact's name.

Always confirm the sequence details and contact list before enrolling. Respect unsubscribe requests immediately.

## Tools

```tools
[
  {
    "name": "create_email_sequence",
    "description": "Create a new email drip sequence with multiple steps.",
    "parameters": {
      "type": "object",
      "properties": {
        "name": { "type": "string", "description": "Name of the sequence (e.g. 'Welcome Series')" },
        "fromEmail": { "type": "string", "description": "Sender email address (optional, defaults to noreply@mail.yokebot.com)" },
        "steps": {
          "type": "array",
          "description": "Ordered list of email steps",
          "items": {
            "type": "object",
            "properties": {
              "delayDays": { "type": "number", "description": "Days to wait before sending this step (0 = immediately)" },
              "subject": { "type": "string", "description": "Email subject line (supports {{name}} placeholder)" },
              "body": { "type": "string", "description": "Email body in HTML (supports {{name}} placeholder)" }
            },
            "required": ["delayDays", "subject", "body"]
          }
        }
      },
      "required": ["name", "steps"]
    }
  },
  {
    "name": "list_email_sequences",
    "description": "List all email sequences for the team.",
    "parameters": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "enroll_contact",
    "description": "Enroll a contact into an email sequence.",
    "parameters": {
      "type": "object",
      "properties": {
        "sequenceId": { "type": "string", "description": "ID of the sequence to enroll into" },
        "email": { "type": "string", "description": "Contact's email address" },
        "name": { "type": "string", "description": "Contact's name (used for {{name}} personalization)" }
      },
      "required": ["sequenceId", "email"]
    }
  },
  {
    "name": "unenroll_contact",
    "description": "Remove a contact from an email sequence.",
    "parameters": {
      "type": "object",
      "properties": {
        "enrollmentId": { "type": "string", "description": "ID of the enrollment to cancel" }
      },
      "required": ["enrollmentId"]
    }
  }
]
```
