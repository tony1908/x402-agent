import express from "express";
import cors from "cors";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { OpenAIAgent } from "./openai-agent.js";
import { walletService } from "./wallet-service.js";
import axios from "axios";
import { withPaymentInterceptor, createSigner, type Hex } from "x402-axios";
import { withEVVMPaymentInterceptor, decodeEVVMPaymentResponse } from "@evvm/x402-client";
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

mcp.registerTool(
  "uber_request_ride",
  {
    title: "Request Uber Ride",
    description: "Automates the process of requesting an Uber ride in Argentina. Navigates to Uber, enters destination, sees prices, and requests the ride. Requires Uber account to be logged in.",
    inputSchema: {
      destination: z.string().describe("The destination address to input in the 'Enter destination' field"),
    },
    outputSchema: {
      status: z.string(),
      summary: z.string(),
      data: z.object({
        destination: z.string().optional(),
        rideType: z.string().optional(),
        price: z.string().optional(),
        confirmationText: z.string().optional(),
        error: z.string().optional(),
      }).optional(),
    },
  },
  async ({ destination }) => {
    try {
      const agent = await getAgent();

      // Create a detailed task for the agent using the specific instructions
      let task = `
Locate the "Enter destination" field, input the destination "${destination}", then click on the first option from the address suggestions to verify the input, and click the "See prices" button to proceed. Wait 5 seconds for the ride options to load, then click the "Request" button to submit the booking. Wait an additional 15 seconds for the process to complete, and finally return a JSON object containing the text or status displayed on the screen as the final result.

IMPORTANT: You are authorized to complete the entire ride request. Do not stop before the final step.

Return a JSON object with the status, destination, ride type, price, and confirmation text if successful.`;

      console.log(`\n🚗 Uber Ride Request Started: ${destination}`);
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
          data: { destination }
        };
      }

      console.log(`\n✅ Uber Ride Request Completed`);

      return {
        content: [{
          type: "text",
          text: typeof parsedResult === 'string' ? parsedResult : JSON.stringify(parsedResult, null, 2)
        }],
        structuredContent: parsedResult,
      };

    } catch (error: any) {
      console.error(`\n❌ Uber Ride Request Failed:`, error);
      const errorResult = {
        status: "error",
        summary: `Failed to request Uber ride to ${destination}`,
        data: {
          destination,
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

mcp.registerTool(
  "get_paid_weather",
  {
    title: "Get Paid Weather Data",
    description: "Calls a paid x402 API to get weather data for a location. Automatically handles payment with wallet on Polygon Amoy. Requires 0.001 USDC per request.",
    inputSchema: {
      location: z.string().describe("City name (e.g., 'Miami', 'Tokyo', 'London')"),
    },
    outputSchema: {
      status: z.string(),
      data: z.object({
        location: z.string().optional(),
        weather: z.string().optional(),
        temperature: z.number().optional(),
        humidity: z.number().optional(),
        timestamp: z.string().optional(),
        paymentInfo: z.object({
          paid: z.boolean(),
          amount: z.string().optional(),
        }).optional(),
        error: z.string().optional(),
      }).optional(),
    },
  },
  async ({ location }) => {
    try {
      // Initialize wallet service
      await walletService.initialize();
      const privateKey = await walletService.getPrivateKey();

      console.log(`\n💳 Making paid API call for weather in ${location} (Polygon Amoy)`);

      // Create signer for x402 payments on Polygon Amoy
      const signer = await createSigner("polygon-amoy", privateKey as Hex);

      // Create axios instance with payment interceptor
      const api = withPaymentInterceptor(
        axios.create({
          baseURL: process.env.PAYMENT_SERVER_URL || "http://localhost:4021",
        }),
        signer
      );

      // Make the request - payment is handled automatically
      const response = await api.get(`/weather?location=${encodeURIComponent(location)}`);

      console.log(`\n✅ Paid weather data received for ${location} (Polygon Amoy)`);

      const result = {
        status: "success",
        data: {
          ...response.data,
          paymentInfo: {
            paid: true,
            amount: "0.001 USDC"
          }
        }
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }],
        structuredContent: result,
      };

    } catch (error: any) {
      console.error(`\n❌ Paid weather API call failed:`, error);
      const errorResult = {
        status: "error",
        data: {
          location,
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

mcp.registerTool(
  "get_evvm_weather",
  {
    title: "Get EVVM Paid Weather Data",
    description: "Calls a paid EVVM x402 API to get weather data. Uses EVVM signature-based payments on Sepolia. Requires 1 token unit per request.",
    inputSchema: {
      location: z.string().describe("City name (e.g., 'Miami', 'Tokyo', 'London')"),
    },
    outputSchema: {
      status: z.string(),
      data: z.object({
        location: z.string().optional(),
        weather: z.string().optional(),
        temperature: z.number().optional(),
        humidity: z.number().optional(),
        timestamp: z.string().optional(),
        paymentInfo: z.object({
          paid: z.boolean(),
          transactionHash: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          amount: z.string().optional(),
        }).optional(),
        error: z.string().optional(),
      }).optional(),
    },
  },
  async ({ location }) => {
    try {
      // Get private key from wallet service or environment
      const privateKey = process.env.EVVM_PRIVATE_KEY as `0x${string}`;

      if (!privateKey) {
        throw new Error("EVVM_PRIVATE_KEY not found in environment variables");
      }

      console.log(`\n💳 Making EVVM paid API call for weather in ${location}`);

      // Create axios instance with EVVM payment interceptor
      const api = withEVVMPaymentInterceptor(
        axios.create({
          baseURL: process.env.EVVM_SERVER_URL || "http://localhost:4022",
        }),
        privateKey
      );

      // Make the request - EVVM payment is handled automatically
      const response = await api.get(`/weather?location=${encodeURIComponent(location)}`);

      console.log(`\n✅ EVVM paid weather data received for ${location}`);

      // Decode payment response from headers
      const paymentResponse = decodeEVVMPaymentResponse(
        response.headers["x-payment-response"]
      );

      const result = {
        status: "success",
        data: {
          ...response.data,
          paymentInfo: paymentResponse ? {
            paid: true,
            transactionHash: paymentResponse.transactionHash,
            from: paymentResponse.from,
            to: paymentResponse.to,
            amount: paymentResponse.amount,
          } : {
            paid: true,
          }
        }
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }],
        structuredContent: result,
      };

    } catch (error: any) {
      console.error(`\n❌ EVVM paid weather API call failed:`, error);
      const errorResult = {
        status: "error",
        data: {
          location,
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

mcp.registerTool(
  "request_uber_evvm",
  {
    title: "Request Uber Ride (EVVM Payment)",
    description: "Calls the EVVM paid API to request an Uber ride using AI agent automation. Uses EVVM signature-based payments on Sepolia. Requires 2 token units per request.",
    inputSchema: {
      destination: z.string().describe("The destination address for the Uber ride"),
    },
    outputSchema: {
      status: z.string(),
      summary: z.string().optional(),
      data: z.object({
        destination: z.string().optional(),
        rideType: z.string().optional(),
        price: z.string().optional(),
        confirmationText: z.string().optional(),
        error: z.string().optional(),
      }).optional(),
      paymentInfo: z.object({
        paid: z.boolean(),
        transactionHash: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        amount: z.string().optional(),
      }).optional(),
    },
  },
  async ({ destination }, extra) => {
    try {
      // Get progress token from metadata
      const token = extra._meta?.progressToken;

      // Helper function to send progress notifications
      const progress = (p: number, total?: number, message?: string) => {
        if (!token) return; // client didn't ask for progress
        extra.sendNotification({
          method: "notifications/progress",
          params: {
            progressToken: token,
            progress: p,
            total,
          },
        } as any);
        if (message) {
          console.log(`[Progress ${p}/${total}] ${message}`);
        }
      };

      progress(0, 100, "🚀 Starting EVVM payment and Uber ride request...");

      // Get private key from environment
      const privateKey = process.env.EVVM_PRIVATE_KEY as `0x${string}`;

      if (!privateKey) {
        throw new Error("EVVM_PRIVATE_KEY not found in environment variables");
      }

      console.log(`\n💳 Making EVVM paid API call to request Uber to ${destination}`);
      progress(10, 100, "💰 Processing EVVM payment signature...");

      // Create axios instance with EVVM payment interceptor
      const api = withEVVMPaymentInterceptor(
        axios.create({
          baseURL: process.env.EVVM_SERVER_URL || "http://localhost:4022",
        }),
        privateKey
      );

      progress(20, 100, "📡 Sending request to EVVM server...");

      // Start a progress updater for long-running agent task
      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const currentProgress = Math.min(30 + elapsed * 2, 90); // 30-90% during agent work
        progress(currentProgress, 100, `🤖 Agent processing Uber request... (${elapsed}s elapsed)`);
      }, 10000);

      try {
        // Make the POST request - EVVM payment is handled automatically
        const response = await api.post("/request-uber", {
          destination,
        });

        clearInterval(progressInterval);
        progress(95, 100, "✅ Uber ride request completed!");

        console.log(`\n✅ EVVM paid Uber request completed for ${destination}`);

        // Decode payment response from headers
        const paymentResponse = decodeEVVMPaymentResponse(
          response.headers["x-payment-response"]
        );

        const result = {
          ...response.data,
          paymentInfo: paymentResponse ? {
            paid: true,
            transactionHash: paymentResponse.transactionHash,
            from: paymentResponse.from,
            to: paymentResponse.to,
            amount: paymentResponse.amount,
          } : {
            paid: true,
          }
        };

        progress(100, 100, "🎉 Complete!");

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }],
          structuredContent: result,
        };
      } finally {
        clearInterval(progressInterval);
      }

    } catch (error: any) {
      console.error(`\n❌ EVVM paid Uber request failed:`, error);
      const errorResult = {
        status: "error",
        summary: `Failed to request Uber to ${destination}`,
        data: {
          destination,
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

mcp.registerTool(
  "request_uber_x402",
  {
    title: "Request Uber Ride (Polygon x402 Payment)",
    description: "Calls the Polygon x402 paid API to request an Uber ride using AI agent automation. Uses facilitator-based payments on Polygon Amoy. Requires 0.002 USDC per request.",
    inputSchema: {
      destination: z.string().describe("The destination address for the Uber ride"),
    },
    outputSchema: {
      status: z.string(),
      summary: z.string().optional(),
      data: z.object({
        destination: z.string().optional(),
        rideType: z.string().optional(),
        price: z.string().optional(),
        confirmationText: z.string().optional(),
        error: z.string().optional(),
      }).optional(),
    },
  },
  async ({ destination }) => {
    try {
      // Initialize wallet service
      await walletService.initialize();
      const privateKey = await walletService.getPrivateKey();

      console.log(`\n💳 Making Polygon x402 paid API call to request Uber to ${destination}`);

      // Create signer for x402 payments on Polygon Amoy
      const signer = await createSigner("polygon-amoy", privateKey as Hex);

      // Create axios instance with payment interceptor
      const api = withPaymentInterceptor(
        axios.create({
          baseURL: process.env.PAYMENT_SERVER_URL || "http://localhost:4021",
        }),
        signer
      );

      // Make the POST request - payment is handled automatically
      const response = await api.post("/request-uber", {
        destination,
      });

      console.log(`\n✅ Polygon x402 paid Uber request completed for ${destination}`);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(response.data, null, 2)
        }],
        structuredContent: response.data,
      };

    } catch (error: any) {
      console.error(`\n❌ Polygon x402 paid Uber request failed:`, error);
      const errorResult = {
        status: "error",
        summary: `Failed to request Uber to ${destination}`,
        data: {
          destination,
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
