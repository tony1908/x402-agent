import express from "express";
import cors from "cors";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { OpenAIAgent } from "./openai-agent.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 1) Create MCP server
const mcp = new McpServer({
  name: "my-dual-client-server",
  version: "0.1.0",
});

// Initialize the OpenAI agent (will be created per request or shared)
let agentInstance: OpenAIAgent | null = null;

async function getAgent(): Promise<OpenAIAgent> {
  if (!agentInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not found in environment variables');
    }

    agentInstance = new OpenAIAgent({
      apiKey,
      model: 'gpt-5-nano', // Use GPT-4 for better reasoning
    });

    await agentInstance.initialize();
  }
  return agentInstance;
}

// 2) Define tools
mcp.registerTool(
  "echo",
  {
    title: "Echo",
    description: "Repeats back whatever text you send",
    inputSchema: { text: z.string() },
    outputSchema: { text: z.string() },
  },
  async ({ text }: { text: string }) => {
    const output = { text: `echo: ${text}` };
    return {
      content: [{ type: "text", text: output.text }],
      structuredContent: output,
    };
  }
);

mcp.registerTool(
  "amazon_buy_product",
  {
    title: "Buy Product on Amazon",
    description: "Automates the process of buying a product on Amazon Mexico. Navigates to the product URL and completes the purchase using 'Comprar ahora'. Requires Amazon credentials and payment method to be set up in the browser.",
    inputSchema: {
      productUrl: z.string().describe("The full Amazon product URL to buy"),
    },
    outputSchema: {
      status: z.string(),
      summary: z.string(),
      data: z.object({
        productUrl: z.string().optional(),
        price: z.string().optional(),
        orderId: z.string().optional(),
        error: z.string().optional(),
      }).optional(),
    },
  },
  async ({ productUrl }) => {
    try {
      const agent = await getAgent();

      // Create a detailed task for the agent using the specific instructions
      let task = `Go to ${productUrl}, locate and click the "Comprar ahora" button on the product page; if a button labeled "Usar esta dirección" appears, click it, then proceed to click the yellow "Usar este método de pago" button, and finally click "Realiza tu pedido y paga" to complete the purchase.

IMPORTANT: You are authorized to complete the entire purchase. Do not stop before the final step.

Return a JSON object with the status, product URL, price, and order ID if successful.`;

      console.log(`\n🛒 Amazon Buy Task Started: ${productUrl}`);
      const result = await agent.processMessage(task);

      // Try to parse the result as JSON
      let parsedResult;
      try {
        parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      } catch {
        // If not JSON, wrap it in a standard response
        parsedResult = {
          status: "completed",
          summary: result,
          data: { productUrl }
        };
      }

      console.log(`\n✅ Amazon Buy Task Completed`);

      return {
        content: [{
          type: "text",
          text: typeof parsedResult === 'string' ? parsedResult : JSON.stringify(parsedResult, null, 2)
        }],
        structuredContent: parsedResult,
      };

    } catch (error: any) {
      console.error(`\n❌ Amazon Buy Task Failed:`, error);
      const errorResult = {
        status: "error",
        summary: `Failed to buy product from ${productUrl}`,
        data: {
          productUrl,
          error: error?.message || String(error)
        }
      };

      return {
        content: [{ type: "text", text: JSON.stringify(errorResult, null, 2) }],
        structuredContent: errorResult,
      };
    }
  }
);

// 3) Handle MCP requests (new transport per request)
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless OK for serverless
    enableJsonResponse: true,
  });

  res.on("close", () => transport.close());

  await mcp.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// health check
app.get("/", (_req, res) => res.send("ok"));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`MCP server running on http://localhost:${port}/mcp`);
});
