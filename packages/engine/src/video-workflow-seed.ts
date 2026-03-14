/**
 * video-workflow-seed.ts — Seeds the Video Production workflow template for a team
 *
 * Creates a 13-step guided pipeline: brief → hooks → scripts → images → audio → assembly → export.
 * Each generation step is model-agnostic with configurable model selection.
 */

import type { Db } from './db/types.ts'
import { createWorkflow, addStep, listWorkflows } from './workflows.ts'

const VIDEO_WORKFLOW_NAME = 'Video Production'

/**
 * Seeds the Video Production workflow for a team.
 * No-op if the team already has a workflow named "Video Production".
 */
export async function seedVideoProductionWorkflow(db: Db, teamId: string): Promise<void> {
  // Check if already seeded
  const existing = await listWorkflows(db, teamId)
  if (existing.some(w => w.name === VIDEO_WORKFLOW_NAME)) return

  const workflow = await createWorkflow(db, teamId, VIDEO_WORKFLOW_NAME, {
    description: 'AI-guided video production pipeline: brief → hooks → scripts → images → audio → assembly → export',
    triggerType: 'manual',
    createdBy: 'system',
  })

  const steps = [
    {
      title: 'Creative Brief',
      description: 'Fill out the creative brief: topic, audience, tone, key messages, video length, format preset.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: 'Present the creative brief form to the user. Collect: topic, target audience, tone/style, key messages, video length (15s/30s/60s/2min), format preset, reference links, and additional notes. Store the completed brief as the workflow context.',
        outputVariable: 'brief',
      }),
    },
    {
      title: 'Generate Hook Options',
      description: 'AI generates 6-12 scroll-stopping hooks based on the brief.',
      gate: 'auto' as const,
      config: JSON.stringify({
        instructions: `Based on the creative brief, generate 6-12 scroll-stopping hooks for the video.
The hook is the first 1-3 seconds — it determines whether viewers watch or scroll past.

For each hook, provide:
- Hook type (question, bold claim, shocking stat, contrarian, story opener, visual hook, pain point, social proof, curiosity gap, direct address)
- The hook text (what appears on screen / is spoken)
- Opening visual suggestion (what the viewer sees in the first 1-3 seconds)
- Why this hook works for the target audience

Tailor hooks to the brief's tone ({{brief.tone}}), audience ({{brief.audience}}), and topic ({{brief.topic}}).
Present all options clearly numbered so the human can pick one.`,
        outputVariable: 'hookOptions',
      }),
    },
    {
      title: 'Pick Hook',
      description: 'Human picks or customizes the opening hook.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: 'Present the generated hooks to the user. They can pick one, combine elements from multiple hooks, or write a custom hook. Store the chosen hook.',
        outputVariable: 'chosenHook',
      }),
    },
    {
      title: 'Draft Script Options',
      description: 'AI writes 2-3 complete scene-by-scene scripts built around the chosen hook.',
      gate: 'auto' as const,
      config: JSON.stringify({
        instructions: `Using the chosen hook as the opening, write 2-3 different script angles. Each angle should have:
- A title and concept description
- Full scene-by-scene breakdown with: scene number, title, narration text, visual description, suggested duration (3-10s), mood/tone notes

Output as JSON array of script options, each containing a scenes array:
[{angle: string, concept: string, scenes: [{sceneNumber, title, narrationText, visualDescription, durationSeconds, mood}]}]

Store the result using update_task with the scripts in the task notes.`,
        outputVariable: 'scriptOptions',
      }),
    },
    {
      title: 'Pick & Refine Script',
      description: 'Human picks a script angle and edits the text.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: 'Present the 2-3 script options to the user. They can pick one, mix scenes from different angles, or edit the text directly. Store the final approved script with all scenes.',
        outputVariable: 'approvedScript',
      }),
    },
    {
      title: 'Draft Image Prompts',
      description: 'AI writes detailed image generation prompts for each scene.',
      gate: 'auto' as const,
      config: JSON.stringify({
        instructions: `Based on the approved script, write detailed image generation prompts for each scene.
Each prompt should be optimized for the generate_image tool.
Include: style, composition, lighting, color palette, subject details.
Maintain visual consistency across scenes (same style, color palette, character descriptions).
Output as JSON: [{sceneNumber, prompt, negativePrompt, style}]`,
        model: 'flux-pro',
        outputVariable: 'imagePrompts',
      }),
    },
    {
      title: 'Review Image Prompts',
      description: 'Human reviews and edits image prompts before credits are spent on generation.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: 'Present all image prompts to the user for review. They can edit prompts, adjust style direction, or approve as-is. This is the last chance to refine before credits are spent on image generation.',
        outputVariable: 'approvedImagePrompts',
      }),
    },
    {
      title: 'Generate Images',
      description: 'Generate images for each scene using approved prompts. Shows credit estimate first.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Using the approved image prompts, generate images for each scene using generate_image.
Before starting, calculate the total credit cost and present it to the user for approval.
Save each image to the workspace under media/originals/.
Track which scene each image belongs to.`,
        model: 'flux-pro',
        outputVariable: 'generatedImages',
      }),
    },
    {
      title: 'Review Images',
      description: 'Human reviews generated images — can swap, regenerate, or upload their own.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: 'Present all generated images alongside their scene scripts. The user can: approve images, request regeneration with modified prompts, or upload their own images to replace any scene. All originals are preserved — uploads and regenerations create new files.',
        outputVariable: 'approvedImages',
      }),
    },
    {
      title: 'Assembly',
      description: 'Open the video editor to arrange scenes on the timeline.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: 'Create a VideoProject with all approved scenes and images. Open the video editor panel for the user to arrange clips on the timeline, set transitions, adjust durations, and preview the visual cut before adding audio.',
        outputVariable: 'assembledProject',
      }),
    },
    {
      title: 'Generate Audio',
      description: 'Generate voiceover, background music, and sound effects.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Generate audio assets for the video:
1. Voiceover: Generate narration from the script text for each scene
2. Background music: Use generate_music with a prompt matching the video mood and tone
3. Sound effects: Use generate_sound_fx for any scene-specific effects noted in the script
Save all audio files to workspace under media/originals/.
Present credit estimate before generating.`,
        voiceModel: 'fish-audio',
        musicModel: 'ace-step',
        sfxModel: 'mirelo',
        outputVariable: 'audioAssets',
      }),
    },
    {
      title: 'AI Video (Optional)',
      description: 'Optionally generate AI video clips for hero scenes using Kling 3.0 or Wan 2.6.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Optional step: generate AI video clips for select hero scenes.
Present the user with scenes that would benefit from motion (hero shots, transitions, product demos).
Each AI video clip costs 3000 credits — show total estimate.
The user can skip this step entirely if they prefer static images with motion graphics.
Use the selected model (Kling 3.0 for premium quality, Wan 2.6 for budget).
Save clips to media/originals/.`,
        model: 'kling-3.0',
        outputVariable: 'videoClips',
      }),
    },
    {
      title: 'Export',
      description: 'Render the final MP4 with assembled scenes, audio, and transitions.',
      gate: 'auto' as const,
      config: JSON.stringify({
        instructions: 'Assemble the final video using the approved timeline: scenes with transitions, voiceover, music, SFX, and any AI video clips. Render to MP4 at the project format preset resolution. Save to workspace.',
        outputVariable: 'finalVideo',
      }),
    },
  ]

  for (let i = 0; i < steps.length; i++) {
    await addStep(db, workflow.id, steps[i].title, {
      description: steps[i].description,
      gate: steps[i].gate,
      config: steps[i].config,
      stepOrder: i,
    })
  }
}
