const MODEL = "@cf/ibm-granite/granite-4.0-h-micro";

const SYSTEM_PROMPT = `You are a COMMAND ROUTER. Your ONLY job is to output a single command.
NEVER explain, describe, list events, or have a conversation.
NEVER use markdown, bullet points, or formatting.
ALWAYS output EXACTLY ONE LINE: the command and nothing else.

Commands:
/start - Welcome message
/help - List all commands
/status - Check API health
/events [limit] [date] - Upcoming events
/event <id> - Event details
/groups - List public groups
/group <slug> - Group details

RULES:
1. If the user wants a specific event or group, call the tool to look up its ID/slug first.
2. After getting tool results, pick the right ID/slug and output the command.
3. ONE LINE ONLY. No text before or after the command.
4. If unsure, output /help.

EXAMPLES:
User: "show me events" -> /events
User: "when is the Chinese exchange?" -> call get_events, find the event, output /event 3
User: "what groups are there?" -> /groups
User: "tell me about the mandarin group" -> call get_groups, find the group, output /group mandarin
User: "hello" -> /help`;

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_events",
      description: "Get upcoming events, optionally filtered by limit and date",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max events to return, default 20",
          },
          from: { type: "string", description: "Date filter (ISO date)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_event",
      description: "Get details for a specific event by its numeric ID",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Event ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_groups",
      description: "Get all public groups",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_group",
      description: "Get details for a specific group by its slug",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Group slug" },
        },
        required: ["slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_status",
      description: "Check the API health status",
      parameters: { type: "object", properties: {} },
    },
  },
];

const KNOWN_COMMANDS = new Set([
  "start",
  "help",
  "status",
  "events",
  "event",
  "groups",
  "group",
]);

export interface ParsedCommand {
  command: string;
  args: string;
}

function parseCommand(text: string): ParsedCommand | null {
  const match = text.trim().match(/\/(\w+)(?:\s+(.*))?/m);
  if (!match) return null;
  const command = match[1];
  if (!KNOWN_COMMANDS.has(command)) return null;
  return { command, args: (match[2] ?? "").trim() };
}

type Message = {
  role: string;
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

export async function interpretMessage(
  ai: Ai,
  userMessage: string,
  execTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<ParsedCommand | null> {
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  for (let round = 0; round < 2; round++) {
    // granite-4.0-h-micro returns ChatCompletion format at runtime,
    // but the generated types map it to AiTextGenerationOutput.
    const result = (await ai.run(MODEL, {
      messages,
      tools: TOOLS,
    })) as unknown as ChatCompletionsOutput;

    const choice = result.choices?.[0]?.message;
    if (!choice) return null;

    if (choice.tool_calls?.length) {
      // granite only returns function tool calls, but the type is a union
      const tcs = choice.tool_calls as Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;

      messages.push({
        role: "assistant",
        content: choice.content ?? "",
        tool_calls: tcs,
      });

      for (const tc of tcs) {
        let toolResult: unknown;
        try {
          const args = JSON.parse(tc.function.arguments);
          toolResult = await execTool(tc.function.name, args);
        } catch (e) {
          toolResult = { error: String(e) };
        }
        messages.push({
          role: "tool",
          content: JSON.stringify(toolResult),
          tool_call_id: tc.id,
        });
      }
      continue;
    }

    if (choice.content) {
      console.log("AI:", choice.content, "tokens:", result.usage?.total_tokens);
      return parseCommand(choice.content);
    }

    return null;
  }

  return null;
}
