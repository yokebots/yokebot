---
name: Render Video
description: Create animated videos programmatically using Remotion (React-based video framework)
tags: [Media]
source: yokebot
version: 1.0.0
author: YokeBot
---

## Instructions

Use the `render_video` tool to create programmatic animated videos using Remotion. You provide a video composition as React/Remotion component code along with input props, and the system renders it to MP4.

This is ideal for:
- Animated explainer videos, product demos, social media clips
- Data visualizations, charts, and infographics in motion
- Title sequences, lower thirds, and motion graphics
- Branded content with consistent styling

### Remotion Conventions (IMPORTANT)
- Use `useCurrentFrame()` and `useVideoConfig()` for timing — NEVER use `requestAnimationFrame`, CSS animations, or `setTimeout`
- Use `<AbsoluteFill>` as the root container
- Use `interpolate()` for smooth transitions between values
- Use `<Sequence>` to arrange elements on the timeline
- All animations must be deterministic (same frame = same output)
- Use `spring()` for natural easing
- Keep compositions under 60 seconds for reasonable render times

## Tools

```tools
[
  {
    "name": "render_video",
    "description": "Render an animated video from a Remotion composition. Provide React component code and props.",
    "parameters": {
      "type": "object",
      "properties": {
        "compositionCode": { "type": "string", "description": "React/Remotion component code as a string. Must export a default component using Remotion APIs (useCurrentFrame, interpolate, Sequence, etc.)" },
        "durationInFrames": { "type": "number", "description": "Video duration in frames (default: 150 = 5 seconds at 30fps)" },
        "fps": { "type": "number", "description": "Frames per second (default: 30)" },
        "width": { "type": "number", "description": "Video width in pixels (default: 1920)" },
        "height": { "type": "number", "description": "Video height in pixels (default: 1080)" },
        "inputProps": { "type": "object", "description": "Props to pass to the composition (title, colors, data, etc.)" }
      },
      "required": ["compositionCode"]
    }
  }
]
```
