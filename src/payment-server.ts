import express from "express";
import { paymentMiddleware } from "x402-express";
import { OpenAIAgent } from "./openai-agent.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Initialize the OpenAI agent for Uber requests
let agentInstance: OpenAIAgent | null = null;

async function getAgent(): Promise<OpenAIAgent> {
  if (!agentInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not found in environment variables');
    }

    agentInstance = new OpenAIAgent({
      apiKey,
      model: 'gpt-5-nano',
    });

    await agentInstance.initialize();
  }
  return agentInstance;
}

const app = express();
const PORT = 4021;

// Add JSON body parser middleware
app.use(express.json());

// Your wallet address to receive payments (replace with your actual address)
const RECEIVER_ADDRESS = process.env.RECEIVER_ADDRESS || "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

app.use(paymentMiddleware(
  RECEIVER_ADDRESS as `0x${string}`,
  {
    // Weather API endpoint - requires payment
    "GET /weather": {
      price: "$0.001", // 0.001 USDC per request
      network: "base-sepolia", // Using testnet
      config: {
        description: "Get current weather data for any location",
        inputSchema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name (e.g., 'San Francisco', 'New York')"
            }
          },
          required: ["location"]
        } as any,
        outputSchema: {
          type: "object",
          properties: {
            location: { type: "string" },
            weather: { type: "string" },
            temperature: { type: "number" },
            humidity: { type: "number" },
            timestamp: { type: "string" }
          }
        } as any
      }
    },
    // Uber ride request endpoint - requires payment
    "POST /request-uber": {
      price: "$0.002", // 0.002 USDC per request
      network: "base-sepolia",
      config: {
        description: "Request an Uber ride using AI agent automation",
        inputSchema: {
          type: "object",
          properties: {
            destination: {
              type: "string",
              description: "Destination address"
            }
          },
          required: ["destination"]
        } as any,
        outputSchema: {
          type: "object",
          properties: {
            status: { type: "string" },
            summary: { type: "string" },
            data: { type: "object" }
          }
        } as any
      }
    },
  },
  {
    // Using testnet facilitator
    url: "https://x402.org/facilitator"
  }
));

// Weather endpoint implementation
app.get("/weather", (req, res) => {
  const location = (req.query.location as string) || "Unknown";

  // Simulate weather data
  const conditions = ["sunny", "cloudy", "rainy", "partly cloudy", "windy"];
  const weather = conditions[Math.floor(Math.random() * conditions.length)];
  const temperature = Math.floor(Math.random() * 30) + 50; // 50-80°F
  const humidity = Math.floor(Math.random() * 40) + 30; // 30-70%

  res.json({
    location,
    weather,
    temperature,
    humidity,
    timestamp: new Date().toISOString()
  });
});

// Uber ride request endpoint (with agent logic)
app.post("/request-uber", async (req, res) => {
  const { destination } = req.body;

  if (!destination) {
    return res.status(400).json({
      status: "error",
      summary: "Missing destination parameter",
      data: { error: "destination is required" }
    });
  }

  try {
    const agent = await getAgent();

    // Create the Uber automation task
    let task = `Go to: https://www.uber.com/ar/en/rider-home/?_csid=M7MyYcBDHhTZs_wr_IIR-A&sm_flow_id=sIRFeDgY&state=5q44YLYj563vgMhhh-u6O6YaLdWu6GjxiqW52CP7qK8%3D
Locate the "Enter destination" field, input the destination "${destination}". Wait for the dropdown menu to appear with address suggestions. DO NOT click on the "suggestions" label text at the top of the dropdown. Instead, click on the FIRST ACTUAL ADDRESS OPTION in the list below the "suggestions" label (it will contain the street name or location details). After selecting the address, click the "See prices" button to proceed. Wait 5 seconds for the ride options to load, then click the "Request" button to submit the booking. Wait an additional 15 seconds for the process to complete, and finally return a JSON object containing the text or status displayed on the screen as the final result.

IMPORTANT: You are authorized to complete the entire ride request. Do not stop before the final step. Remember to click on the actual address in the dropdown, NOT the "suggestions" text label.

Return a JSON object with the status, destination, ride type, price, and confirmation text if successful.`;

    console.log(`\n🚗 Uber Ride Request Started (via Coinbase x402): ${destination}`);
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

    console.log(`\n✅ Uber Ride Request Completed (via Coinbase x402)`);

    res.json(parsedResult);

  } catch (error: any) {
    console.error(`\n❌ Uber Ride Request Failed (via Coinbase x402):`, error);
    res.status(500).json({
      status: "error",
      summary: `Failed to request Uber ride to ${destination}`,
      data: {
        destination,
        error: error?.message || String(error)
      }
    });
  }
});

// Health check endpoint (free)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Payment server is running",
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 x402 Payment Server running at http://localhost:${PORT}`);
  console.log(`\n📍 Available endpoints:`);
  console.log(`   GET /health - Free endpoint`);
  console.log(`   GET /weather?location=<city> - Paid (0.001 USDC)`);
  console.log(`   POST /request-uber - Paid (0.002 USDC) - AI Agent Service`);
  console.log(`\n💰 Receiving payments at: ${RECEIVER_ADDRESS}`);
  console.log(`🌐 Network: Base Sepolia (testnet)`);
  console.log(`\n📝 Try it: curl http://localhost:${PORT}/weather?location=Miami\n`);
});
