/**
 * runtime.ts — ReAct loop: the core reasoning cycle
 *
 * Receive message → Think → Act → Observe → Repeat
 *
 * The ReAct (Reasoning + Acting) loop is how agents process work.
 * On each cycle the agent: reads its messages, thinks about what
 * to do, optionally calls tools, observes the results, and responds.
 */

import type Database from 'better-sqlite3'
import { chatCompletion, type ChatMessage, type ToolDef, type ToolCall, type ModelConfig } from './model.ts'
import { getMessages, addMessage } from './agent.ts'

export interface RuntimeConfig {
  maxIterations: number  // safety limit to prevent infinite loops
}

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  maxIterations: 10,
}

/**
 * Built-in tools that every agent has access to.
 * Additional tools come from installed skills.
 */
function getBuiltinTools(): ToolDef[] {
  return [
    {
      type: 'function',
      function: {
        name: 'think',
        description: 'Use this tool to think through a problem step by step before acting. Write your reasoning here.',
        parameters: {
          type: 'object',
          properties: {
            thought: {
              type: 'string',
              description: 'Your step-by-step reasoning',
            },
          },
          required: ['thought'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'respond',
        description: 'Send a message to the user or team channel. Use this when you have a response ready.',
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to send',
            },
          },
          required: ['message'],
        },
      },
    },
  ]
}

/**
 * Execute a single tool call and return the result.
 */
function executeToolCall(toolCall: ToolCall): string {
  const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>

  switch (toolCall.function.name) {
    case 'think':
      // Think tool — just returns the thought, no side effect
      return `Thought: ${args.thought as string}`

    case 'respond':
      // Respond tool — the message is the final output
      return `Response: ${args.message as string}`

    default:
      return `Unknown tool: ${toolCall.function.name}`
  }
}

export interface RunResult {
  response: string | null
  iterations: number
  toolCalls: Array<{ name: string; result: string }>
}

/**
 * Run the ReAct loop for an agent processing a user message.
 *
 * 1. Load conversation history
 * 2. Add the new user message
 * 3. Loop: call model → if tool calls, execute them → feed results back
 * 4. When model responds with text (no tool calls), return the response
 */
export async function runReactLoop(
  db: Database.Database,
  agentId: string,
  userMessage: string,
  modelConfig: ModelConfig,
  systemPrompt: string,
  config: RuntimeConfig = DEFAULT_RUNTIME_CONFIG,
): Promise<RunResult> {
  // Save the user message
  addMessage(db, agentId, 'user', userMessage)

  // Build the message history
  const history = getMessages(db, agentId, 50)
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as ChatMessage['role'],
      content: m.content,
    })),
  ]

  const tools = getBuiltinTools()
  const toolCallLog: Array<{ name: string; result: string }> = []
  let response: string | null = null

  for (let i = 0; i < config.maxIterations; i++) {
    const completion = await chatCompletion(modelConfig, messages, tools)

    // If the model returned tool calls, execute them
    if (completion.tool_calls.length > 0) {
      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: completion.content,
        tool_calls: completion.tool_calls,
      })

      for (const toolCall of completion.tool_calls) {
        const result = executeToolCall(toolCall)
        toolCallLog.push({ name: toolCall.function.name, result })

        // If this is a "respond" call, capture the response
        if (toolCall.function.name === 'respond') {
          const args = JSON.parse(toolCall.function.arguments) as { message: string }
          response = args.message
        }

        // Feed the tool result back to the model
        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        })
      }

      // If agent responded, we're done
      if (response !== null) {
        addMessage(db, agentId, 'assistant', response)
        return { response, iterations: i + 1, toolCalls: toolCallLog }
      }

      // Otherwise continue the loop (agent thought but didn't respond yet)
      continue
    }

    // No tool calls — model gave a direct text response
    if (completion.content) {
      response = completion.content
      addMessage(db, agentId, 'assistant', response)
      return { response, iterations: i + 1, toolCalls: toolCallLog }
    }

    // Empty response — shouldn't happen, but break to be safe
    break
  }

  // If we hit max iterations without a response
  const fallback = response ?? 'I was unable to complete the task within the iteration limit.'
  addMessage(db, agentId, 'assistant', fallback)
  return { response: fallback, iterations: config.maxIterations, toolCalls: toolCallLog }
}
