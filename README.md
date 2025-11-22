# OpenAI MCP Browser Agent

A TypeScript agent that uses the OpenAI SDK to interact with the Browser MCP (Model Context Protocol) server for browser automation tasks.

## Overview

This project demonstrates how to create an AI agent using:
- **OpenAI SDK** for natural language understanding and function calling
- **Browser MCP Server** for browser automation capabilities
- **TypeScript** for type-safe development

The agent can interpret natural language commands and translate them into browser automation actions like navigating pages, filling forms, clicking elements, and extracting data.

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- An OpenAI API key
- Browser MCP server (automatically installed via npm)

## Installation

1. Clone or navigate to this directory:
```bash
cd /Users/antoniosantiagoduenas/Documents/Development/hackathones/ethglobalbuenosaires/tests/agent
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment variables:
```bash
cp .env.example .env
```

Then edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=sk-your-api-key-here
```

## Project Structure

```
agent/
├── src/
│   ├── mcp-client.ts      # MCP client implementation
│   ├── openai-agent.ts    # OpenAI agent with MCP integration
│   └── example.ts         # Interactive CLI example
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Usage

### Running the Interactive Example

The easiest way to test the agent is through the interactive CLI:

```bash
npm run example
```

This will:
1. Connect to the Browser MCP server
2. Initialize the OpenAI agent
3. Show available browser automation tools
4. Let you interact with the agent using natural language

### Using the Agent in Your Code

```typescript
import { OpenAIAgent } from './src/openai-agent.js';

async function main() {
  // Initialize the agent
  const agent = new OpenAIAgent({
    apiKey: 'your-openai-api-key',
    model: 'gpt-4-turbo-preview', // or 'gpt-3.5-turbo'
  });

  await agent.initialize();

  // Process a natural language command
  const result = await agent.processMessage(
    "Navigate to https://example.com and extract the main heading"
  );

  console.log(result);

  // Clean up
  await agent.cleanup();
}

main().catch(console.error);
```

### Direct Tool Execution

You can also execute MCP tools directly:

```typescript
// List available tools
const capabilities = await agent.listCapabilities();
console.log('Available tools:', capabilities.tools);

// Execute a specific tool
const result = await agent.executeBrowserTask(
  'Navigate to a website',
  'navigate',
  { url: 'https://example.com' }
);
```

## Key Components

### MCPClient (`mcp-client.ts`)

- Handles connection to the Browser MCP server
- Manages tool discovery and execution
- Provides typed interfaces for MCP operations

### OpenAIAgent (`openai-agent.ts`)

- Integrates OpenAI's GPT models with MCP tools
- Converts natural language to tool calls
- Handles function calling and response processing

### Example (`example.ts`)

- Interactive CLI for testing the agent
- Demonstrates real-world usage patterns
- Shows how to handle user input and display results

## Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run in development mode with tsx
- `npm run example` - Run the interactive example
- `npm start` - Run the compiled JavaScript

## How It Works

1. **User Input**: The user provides a natural language command
2. **OpenAI Processing**: The agent sends the command to OpenAI's API
3. **Function Calling**: OpenAI determines which MCP tools to use
4. **Tool Execution**: The agent calls the appropriate Browser MCP tools
5. **Result Processing**: The agent formats and returns the results

## Example Commands

- "Navigate to https://github.com"
- "Fill the search box with 'OpenAI MCP'"
- "Click the submit button"
- "Extract all links from the current page"
- "Take a screenshot of the page"
- "Scroll down to the footer"

## Troubleshooting

### MCP Server Connection Issues

If you can't connect to the MCP server:
1. Ensure Node.js is properly installed
2. Check that `npx @browsermcp/mcp@latest` works in your terminal
3. Verify no firewall is blocking local connections

### OpenAI API Errors

If you get API errors:
1. Verify your API key is correct in `.env`
2. Check you have sufficient API credits
3. Ensure your API key has the necessary permissions

### TypeScript Errors

If you encounter TypeScript errors:
1. Run `npm run build` to check for compilation errors
2. Ensure all dependencies are installed with `npm install`
3. Check that your Node.js version is 18 or higher

## Contributing

Feel free to extend this agent with:
- Additional error handling
- More sophisticated conversation management
- Custom browser automation workflows
- Integration with other MCP servers

## License

ISC