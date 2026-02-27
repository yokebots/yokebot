---
name: Create Quiz
description: Generate training quizzes and assessments from source material
tags: [Business]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `create_quiz` tool to generate quizzes and assessments from training material. It creates questions of various types (multiple choice, true/false, short answer) with answer keys and explanations.

Mix question types for engagement. Include both recall and application questions.

## Tools

```tools
[
  {
    "name": "create_quiz",
    "description": "Generate a quiz or assessment from training material.",
    "parameters": {
      "type": "object",
      "properties": {
        "material": { "type": "string", "description": "The source material to base questions on" },
        "questionCount": { "type": "number", "description": "Number of questions to generate (default: 10)" },
        "difficulty": { "type": "string", "description": "Difficulty level: 'beginner', 'intermediate', 'advanced' (default: intermediate)" },
        "questionTypes": { "type": "string", "description": "Comma-separated types: 'multiple-choice', 'true-false', 'short-answer', 'scenario' (default: mixed)" }
      },
      "required": ["material"]
    }
  }
]
```
