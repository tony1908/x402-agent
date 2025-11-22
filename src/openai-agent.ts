import OpenAI from 'openai';
import { MCPClient, MCPTool } from './mcp-client';

export interface AgentConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
}

export class OpenAIAgent {
  private openai: OpenAI;
  private mcpClient: MCPClient;
  private model: string;
  private availableTools: MCPTool[] = [];

  constructor(config: AgentConfig) {
    this.openai = new OpenAI({
      apiKey: config.apiKey,
    });
    this.model = config.model || 'gpt-5-nano';
    this.mcpClient = new MCPClient();
  }

  /**
   * Initialize the agent and connect to MCP server
   */
  async initialize(): Promise<void> {
    console.log('Initializing OpenAI Agent...');
    await this.mcpClient.connect();
    this.availableTools = await this.mcpClient.listTools();
    console.log(`Agent initialized with ${this.availableTools.length} available tools`);
  }

  /**
   * Convert MCP tools to OpenAI function format
   */
  private convertToOpenAIFunctions(): OpenAI.ChatCompletionTool[] {
    return this.availableTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description || `Execute ${tool.name} operation`,
        parameters: tool.inputSchema || {
          type: 'object',
          properties: {},
        },
      },
    }));
  }

  /**
   * Process a user message and execute browser automation tasks
   */
  async processMessage(userMessage: string): Promise<string> {
    try {
      console.log('Processing message:', userMessage);

      // Prepare the conversation with system context
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are an AI assistant with access to browser automation tools via MCP.
          You can navigate web pages, fill forms, click buttons, and extract information.
          Available tools: ${this.availableTools.map(t => t.name).join(', ')}

          When the user asks you to perform browser tasks:
          1. Break down the task into steps.
          2. Use the appropriate tools to accomplish each step.
          3. IMPORTANT: After navigating or performing an action that changes the page, ALWAYS use 'browser_snapshot' to understand the new page structure before trying to interact with elements.
          4. If you need to wait for something to appear (like an autocomplete dropdown), use 'browser_wait' and then check the page again with 'browser_snapshot'.
          5. Be precise with your interactions. If a user specifies a button color or label, verify it in the snapshot.
          6. Report the results clearly.

          USER AUTHORIZATION:
          The user has explicitly authorized you to perform ALL actions, including financial transactions, clicking 'Buy Now', 'Place Order', or 'Submit Payment'. 
          DO NOT STOP to ask for confirmation before the final step. 
          If the user's request implies completing a purchase (e.g., "buy this", "submit the form"), YOU MUST CLICK THE FINAL BUTTON to complete the task.

          CRITICAL INSTRUCTION FOR FINAL OUTPUT:
          When the task is completed, your final response MUST be a valid JSON object containing all the relevant information you extracted or achieved. 
          Do not wrap it in markdown code blocks like \`\`\`json ... \`\`\`. Just return the raw JSON string.
          
          Example format:
          {
            "status": "success",
            "summary": "Task completed successfully",
            "data": {
              "extracted_field_1": "value",
              "extracted_field_2": "value"
            }
          }
          
          Always explain what you're doing before executing browser actions.`,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ];

      let maxSteps = 20; // Safety limit for the conversation loop

      while (maxSteps > 0) {
        // Get OpenAI's response with function calling
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages,
          tools: this.convertToOpenAIFunctions(),
          tool_choice: 'auto',
        });

        const assistantMessage = response.choices[0].message;
        messages.push(assistantMessage);

        // Check if the assistant wants to call tools
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          console.log(`\n🤖 AI Requesting ${assistantMessage.tool_calls.length} tool(s)...`);
          
          for (const toolCall of assistantMessage.tool_calls) {
            console.log(`  > Executing tool: ${toolCall.function.name}`);

            let result: any;
            try {
              // Parse the arguments
              const args = JSON.parse(toolCall.function.arguments);

              // Call the MCP tool
              result = await this.mcpClient.callTool(
                toolCall.function.name,
                args
              );
              
              console.log(`  ✓ Tool executed`);
            } catch (error: any) {
              console.error(`  ✗ Error executing ${toolCall.function.name}:`, error);
              result = `Error executing ${toolCall.function.name}: ${error?.message || String(error)}`;
            }

            // Add the tool result to the conversation history
            messages.push({
              role: 'tool',
              content: typeof result === 'string' ? result : JSON.stringify(result),
              tool_call_id: toolCall.id,
            });
          }
          
          // Continue the loop to let the AI process the tool results
          maxSteps--;
        } else {
          // No more tools to call, return the final response
          return assistantMessage.content || 'Task completed';
        }
      }

      return "Maximum conversation steps reached. The task may be incomplete.";

    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }

  /**
   * Execute a specific browser automation task
   */
  async executeBrowserTask(taskDescription: string, toolName?: string, args?: Record<string, any>): Promise<any> {
    try {
      if (toolName && args) {
        // Direct tool execution
        console.log(`Executing ${toolName} with args:`, args);
        return await this.mcpClient.callTool(toolName, args);
      } else {
        // Let the AI decide which tools to use
        return await this.processMessage(taskDescription);
      }
    } catch (error) {
      console.error('Error executing browser task:', error);
      throw error;
    }
  }

  /**
   * List all available browser automation capabilities
   */
  async listCapabilities(): Promise<{ tools: MCPTool[], resources: any[] }> {
    const tools = await this.mcpClient.listTools();
    const resources = await this.mcpClient.listResources();

    return { tools, resources };
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup(): Promise<void> {
    await this.mcpClient.disconnect();
  }
}