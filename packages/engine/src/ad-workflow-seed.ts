/**
 * ad-workflow-seed.ts — Seeds the Rapid Image Ads workflow template for a team
 *
 * Creates a 10-step guided pipeline for generating static image ads:
 * brief → style refs → hero image → review → format variations → text correction → review → export
 *
 * Hardcoded models for reliability:
 * - Image generation: Nano Banana 2 (100 credits, excellent text rendering)
 * - Image editing: FireRed Image Edit (150 credits, instruction-based editing)
 */

import type { Db } from './db/types.ts'
import { createWorkflow, addStep, listWorkflows } from './workflows.ts'

const AD_WORKFLOW_NAME = 'Rapid Image Ads'

/**
 * Seeds the Rapid Image Ads workflow for a team.
 * No-op if the team already has a workflow named "Rapid Image Ads".
 */
export async function seedRapidImageAdsWorkflow(db: Db, teamId: string): Promise<void> {
  const existing = await listWorkflows(db, teamId)
  if (existing.some(w => w.name === AD_WORKFLOW_NAME)) return

  const workflow = await createWorkflow(db, teamId, AD_WORKFLOW_NAME, {
    description: 'AI-guided static ad creation: brief → style references → hero image → format variations → text polish → export',
    triggerType: 'manual',
    createdBy: 'system',
  })

  const steps = [
    {
      title: 'Ad Brief',
      description: 'Fill out the ad brief: product/service, audience, goal, copy, visual direction.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Present the ad brief form to the user. Collect:
- Product or service name
- Target audience (demographics, interests)
- Ad goal (awareness, click-through, conversion, engagement)
- Headline text (required — this appears ON the ad)
- Body copy / tagline (optional secondary text)
- Call-to-action text (e.g. "Shop Now", "Learn More")
- Visual direction / mood (bold, minimal, luxurious, playful, professional, etc.)
- Brand colors (hex codes or color names)
- Aspect ratio: "1:1" (Instagram/Facebook feed), "9:16" (Stories/Reels), "16:9" (landscape/banner), "4:5" (Facebook feed optimized)
- Additional notes or reference URLs

Store the completed brief as the workflow context.`,
        outputVariable: 'brief',
      }),
    },
    {
      title: 'Upload Style References',
      description: 'Optional: user uploads up to 6 reference images to guide the visual style.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Ask the user if they have style reference images they'd like to use.

Style references help the AI match a specific visual aesthetic — brand imagery, competitor ads, mood boards, or any image whose look and feel they want to emulate.

- Accept up to 6 images (upload to workspace or provide URLs)
- If they have references, store the image URLs/paths
- If they don't have references, that's fine — skip this step

The user can also skip this step entirely if they prefer to start from scratch.`,
        outputVariable: 'styleRefs',
      }),
    },
    {
      title: 'Generate Hero Image',
      description: 'AI generates the primary ad image using Nano Banana 2.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Using the ad brief, craft a detailed image generation prompt optimized for Nano Banana 2.

The prompt MUST include:
- The headline text embedded in the image (Nano Banana 2 excels at text rendering)
- Visual composition matching the brief's mood/direction
- Brand colors incorporated into the design
- The call-to-action text if provided
- Layout appropriate for the chosen aspect ratio

Use generate_image with:
- modelId: "nano-banana-2"
- aspect_ratio: the ratio from the brief
- image_urls: style reference URLs if provided in previous step (up to 6)

Before generating, show the user:
1. The prompt you'll use
2. The credit cost (100 credits per generation)
3. Ask for confirmation

Generate ONE hero image. The user will review and can request regeneration.`,
        model: 'nano-banana-2',
        editModel: 'firered-image-edit',
        outputVariable: 'heroImage',
      }),
    },
    {
      title: 'Review Hero Image',
      description: 'Human reviews the hero image — approve, regenerate, or adjust.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Present the generated hero image to the user.

Options:
1. **Approve** — move to format variations
2. **Regenerate** — modify the prompt and generate again (100 credits per attempt)
3. **Edit with FireRed** — use edit_image to make specific changes (fix text, adjust colors, remove elements) for 150 credits
4. **Upload their own** — user can upload a custom image to use instead

If regenerating, incorporate their feedback into the prompt and re-run generate_image.
If editing, use edit_image with modelId "firered-image-edit" and the user's editing instructions.

Keep iterating until the user approves the hero image.`,
        outputVariable: 'approvedHeroImage',
      }),
    },
    {
      title: 'Format Variations',
      description: 'Generate the ad in additional aspect ratios using the hero image as a style reference.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Ask the user which additional formats they want. Common options:
- 1:1 (Instagram/Facebook feed)
- 9:16 (Stories/Reels/TikTok)
- 16:9 (Landscape/YouTube/Banner)
- 4:5 (Facebook feed optimized)
- 4:3 (Display ads)

They already have the hero image in their chosen ratio. Each additional format costs 100 credits.

Show the total credit cost and get confirmation before generating.

For each additional format, use generate_image with:
- modelId: "nano-banana-2"
- prompt: the SAME prompt used for the hero image
- image_urls: [hero image URL] plus any style references — this ensures visual consistency
- aspect_ratio: the target format

The hero image as a style reference ensures all formats maintain the same visual identity.`,
        model: 'nano-banana-2',
        outputVariable: 'formatVariations',
      }),
    },
    {
      title: 'Review Variations',
      description: 'Human reviews all format variations — approve, regenerate, or edit individual formats.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Present all generated format variations side by side (or in sequence) with the hero image.

For each variation, the user can:
1. **Approve** — keep as-is
2. **Regenerate** — re-run with adjusted prompt (100 credits)
3. **Edit** — use edit_image with FireRed to fix specific issues (150 credits)

Common issues to watch for in format variations:
- Text getting cut off in narrow formats (9:16)
- Composition not working in the new ratio
- Brand elements missing or repositioned poorly

Keep iterating per-format until all are approved.`,
        outputVariable: 'approvedVariations',
      }),
    },
    {
      title: 'Text Correction',
      description: 'Optional: fix any text rendering issues using FireRed Image Edit.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Review all approved images for text accuracy. Check:
- Headline text matches exactly what the user specified
- Call-to-action text is correct
- No misspelled words or garbled characters
- Text is legible and properly positioned

If any text issues are found, use edit_image with:
- modelId: "firered-image-edit"
- image_urls: [the image with the issue]
- prompt: specific instruction like "Change the headline text to 'Exact Text Here'" or "Fix the misspelled word 'recieve' to 'receive'"

Each edit costs 150 credits. Show the user what needs fixing and get confirmation.

If all text is perfect, the user can skip this step.`,
        editModel: 'firered-image-edit',
        outputVariable: 'textCorrectedImages',
      }),
    },
    {
      title: 'Final Review',
      description: 'Human does a final review of all ad images before export.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Present the complete set of final ad images:
- Hero image (primary format)
- All format variations
- Any text-corrected versions

For each image, show: format/ratio, file path, dimensions.

The user gives final approval. They can still request last-minute edits (FireRed, 150 credits each) or regenerations (Nano Banana 2, 100 credits each).

Once approved, proceed to export.`,
        outputVariable: 'finalApprovedImages',
      }),
    },
    {
      title: 'Export',
      description: 'Organize final files and provide download links.',
      gate: 'auto' as const,
      config: JSON.stringify({
        instructions: `Organize all approved final images into the workspace:

1. Save to media/ads/ with clear naming:
   - {product}_{format}_{variant}.png (e.g. "sneakers_1x1_hero.png", "sneakers_9x16_stories.png")
2. Create a summary with:
   - All file paths and dimensions
   - The original prompt used
   - Credit cost breakdown (total credits spent across all generations and edits)
3. Post the final images as attachments in the team chat

Present the summary to the user with all download links.`,
        outputVariable: 'exportedAds',
      }),
    },
    {
      title: 'Campaign Notes',
      description: 'Save campaign context for future ad runs.',
      gate: 'auto' as const,
      config: JSON.stringify({
        instructions: `Save a campaign summary to the workspace as a reference for future ad runs:

- Product/service details from the brief
- Winning prompt(s) that produced the best results
- Style reference images used
- Aspect ratios generated
- Total credits spent
- Any notes the user wants to save for next time

Save as a workspace file: media/ads/{product}_campaign_notes.txt

This helps the user reproduce or iterate on successful ad campaigns later.`,
        outputVariable: 'campaignNotes',
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
