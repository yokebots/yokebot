---
name: Score Resume
description: Evaluate resumes against job criteria with detailed scoring
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `score_resume` tool to evaluate a resume against specific job criteria. It scores the candidate on relevant experience, skills match, education, and overall fit, with detailed rationale.

Be objective and consistent. Score based on evidence in the resume, not assumptions.

## Tools

```tools
[
  {
    "name": "score_resume",
    "description": "Evaluate a resume against job criteria and provide a detailed score.",
    "parameters": {
      "type": "object",
      "properties": {
        "resume": { "type": "string", "description": "The resume text to evaluate" },
        "jobCriteria": { "type": "string", "description": "Job requirements and desired qualifications to score against" },
        "weights": { "type": "string", "description": "Optional scoring weights: 'experience-heavy', 'skills-heavy', 'balanced' (default: balanced)" }
      },
      "required": ["resume", "jobCriteria"]
    }
  }
]
```
