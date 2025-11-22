import { OpenAIAgent } from './openai-agent';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

// Create readline interface for interactive CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

async function runExample() {
  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY not found in environment variables');
    console.log('Please create a .env file with: OPENAI_API_KEY=your-api-key');
    process.exit(1);
  }

  // Create and initialize the agent
  const agent = new OpenAIAgent({
    apiKey,
    model: 'gpt-5-nano', // or 'gpt-3.5-turbo' for faster/cheaper responses
  });

  try {
    console.log('🤖 OpenAI Browser Automation Agent');
    console.log('==================================');
    console.log('Initializing agent and connecting to Browser MCP server...\n');

    await agent.initialize();

    // Show available capabilities
    const capabilities = await agent.listCapabilities();
    console.log('\n📋 Available Browser Automation Tools:');
    capabilities.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description || 'No description'}`);
    });

    console.log('\n✨ Example tasks you can ask:');
    console.log('  - "Navigate to https://example.com"');
    console.log('  - "Fill the search form with \'OpenAI MCP\'"');
    console.log('  - "Click the submit button"');
    console.log('  - "Extract all links from the page"');
    console.log('  - "Take a screenshot of the current page"');
    console.log('\nType "exit" to quit\n');

    // Interactive loop
    while (true) {
      const userInput = await question('\n💬 What would you like me to do? > ');

      if (userInput.toLowerCase() === 'exit') {
        break;
      }

      if (!userInput.trim()) {
        continue;
      }

      try {
        console.log('\n🔄 Processing your request...');
        const result = await agent.processMessage(userInput);
        console.log('\n✅ Result:', result);
      } catch (error: any) {
        console.error('\n❌ Error:', error?.message || String(error));
      }
    }

    console.log('\n👋 Shutting down...');
    await agent.cleanup();
  } catch (error) {
    console.error('Fatal error:', error);
    await agent.cleanup();
    process.exit(1);
  }

  rl.close();
  process.exit(0);
}

// Run the example
runExample().catch(console.error);