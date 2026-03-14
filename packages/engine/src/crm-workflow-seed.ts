/**
 * crm-workflow-seed.ts — Seeds the Sales CRM workflow template for a team
 *
 * Creates a 4-step guided pipeline for managing sales contacts:
 * add contact → schedule call → tag & notes → follow-up email
 */

import type { Db } from './db/types.ts'
import { createWorkflow, addStep, listWorkflows } from './workflows.ts'

const CRM_WORKFLOW_NAME = 'Sales CRM'

/**
 * Seeds the Sales CRM workflow for a team.
 * No-op if the team already has a workflow named "Sales CRM".
 */
export async function seedSalesCrmWorkflow(db: Db, teamId: string): Promise<void> {
  const existing = await listWorkflows(db, teamId)
  if (existing.some(w => w.name === CRM_WORKFLOW_NAME)) return

  const workflow = await createWorkflow(db, teamId, CRM_WORKFLOW_NAME, {
    description: 'Lightweight sales pipeline: add contacts → schedule calls → tag & note → follow up',
    triggerType: 'manual',
    createdBy: 'system',
  })

  const steps = [
    {
      title: 'Add Contact',
      description: 'Collect lead/contact info and add a row to the Contacts data table.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Collect the following contact information from the user:

- Full name (required)
- Email address
- Phone number
- Company / organization
- Lead source (e.g. website, referral, LinkedIn, cold outreach, event)
- Service or product interest
- Any initial notes

Once collected, add a new row to the "Contacts" data table using write_to_table. If the table doesn't exist yet, create it first with columns: Name, Email, Phone, Company, Source, Interest, Notes, Status, Tags, Last Contact Date.

Set the Status to "New" and Last Contact Date to today.

Present the completed contact record to the user for approval before saving.`,
        outputVariable: 'contactInfo',
      }),
    },
    {
      title: 'Schedule Call',
      description: 'Create a task to call the contact with a suggested time window.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Using the contact info from the previous step, create a follow-up call task.

1. Suggest a time window for the call based on business hours (e.g. "Tomorrow 10am-12pm" or "This Thursday afternoon")
2. Draft a brief call agenda based on the contact's service interest
3. Present the suggested time and agenda to the user for confirmation or adjustment

Once approved, create a task assigned to the user with:
- Title: "Call [Contact Name] — [Company]"
- Description: the call agenda
- Due date: the agreed time

Also set a reminder: if the call hasn't happened within 48 hours, the agent should follow up with the user about rescheduling.`,
        outputVariable: 'scheduledCall',
      }),
    },
    {
      title: 'Add Tags & Notes',
      description: 'Tag the contact (hot/warm/cold, service type) and add call notes.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `After the initial contact or call, help the user tag and annotate the contact record.

Ask the user for:
1. **Temperature**: Hot / Warm / Cold
2. **Service tags**: Which products or services are they interested in?
3. **Location** (if relevant)
4. **Call/meeting notes**: What was discussed? Key takeaways?
5. **Next action**: What should happen next?

Update the contact's row in the Contacts data table:
- Add the tags to the Tags column (comma-separated)
- Update the Status column (e.g. "Contacted", "Qualified", "Proposal Sent")
- Add the notes to the Notes column (append, don't overwrite)
- Update Last Contact Date to today

Present the updated record for approval.`,
        outputVariable: 'callNotes',
      }),
    },
    {
      title: 'Send Follow-Up Email',
      description: 'Draft a personalized follow-up email based on contact info, tags, and notes.',
      gate: 'approval' as const,
      config: JSON.stringify({
        instructions: `Using the contact info, tags, and call notes from previous steps, draft a personalized follow-up email.

The email should:
- Address the contact by name
- Reference the specific conversation or interaction
- Highlight the services/products they expressed interest in
- Include a clear next step or call-to-action
- Be professional but warm in tone
- Be concise (under 200 words)

Present the full email draft to the user:
- To: [contact email]
- Subject: [suggested subject line]
- Body: [the draft]

The user can:
1. **Approve** — mark the email as ready to send
2. **Edit** — request changes to the draft
3. **Skip** — no follow-up needed for this contact

If approved, log the follow-up in the Contacts table Notes column with the date.`,
        outputVariable: 'followUpEmail',
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
