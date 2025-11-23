import express from "express";
import { evvmPaymentMiddleware } from "@evvm/x402-middleware";
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
const PORT = 4022;

// Add JSON body parser middleware
app.use(express.json());

// Server's relayer private key (used to execute transactions on behalf of users)
const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;

if (!relayerPrivateKey) {
  console.error("RELAYER_PRIVATE_KEY environment variable is required");
  console.error("Add it to your .env file");
  process.exit(1);
}

// Optional: Custom RPC URL to avoid rate limiting
const rpcUrl = process.env.RPC_URL;

// Your wallet address that will receive payments
const receivingAddress = process.env.RECEIVER_ADDRESS || "0x171550d64ed48a3767138149baac989f03890fd9";

// USDC token address on Sepolia
const usdcSepoliaAddress = "0x2FE943eE9bD346aF46d46BD36c9ccb86201Da21A";

// Apply EVVM payment middleware
app.use(
  evvmPaymentMiddleware(
    receivingAddress as `0x${string}`,
    {
      // Weather endpoint - requires payment
      "GET /weather": {
        price: "1", // 1 token unit (not dollar amount!)
        tokenAddress: usdcSepoliaAddress,
        evvmID: "2", // EVVM ID for Sepolia
        network: "sepolia",
        config: {
          description: "Get current weather data for any location",
          inputSchema: {
            type: "object",
            properties: {
              location: { type: "string", description: "City name" },
            },
          },
          outputSchema: {
            type: "object",
            properties: {
              location: { type: "string" },
              weather: { type: "string" },
              temperature: { type: "number" },
              humidity: { type: "number" },
              timestamp: { type: "string" },
            },
          },
        },
      },
      // Premium data endpoint
      "GET /premium-data": {
        price: "1", // 1 token unit
        tokenAddress: usdcSepoliaAddress,
        evvmID: "2",
        network: "sepolia",
        config: {
          description: "Access to premium market data",
          outputSchema: {
            type: "object",
            properties: {
              data: { type: "string" },
              timestamp: { type: "number" },
              marketData: { type: "object" },
            },
          },
        },
      },
      // Uber ride request endpoint
      "POST /request-uber": {
        price: "2", // 2 token units for agent service
        tokenAddress: usdcSepoliaAddress,
        evvmID: "2",
        network: "sepolia",
        config: {
          description: "Request an Uber ride using AI agent automation",
          inputSchema: {
            type: "object",
            properties: {
              destination: { type: "string", description: "Destination address" },
            },
            required: ["destination"],
          },
          outputSchema: {
            type: "object",
            properties: {
              status: { type: "string" },
              summary: { type: "string" },
              data: { type: "object" },
            },
          },
        },
      },
    },
    {
      // Default EVVM contract address for Sepolia
      defaultEvvmAddress: "0x9902984d86059234c3B6e11D5eAEC55f9627dD0f",
      // Relayer private key for executing transactions
      relayerPrivateKey,
      // Optional: Custom RPC URL
      rpcUrl,
    }
  )
);

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
    timestamp: new Date().toISOString(),
  });
});

// Premium data endpoint
app.get("/premium-data", (req, res) => {
  res.json({
    data: "This is premium content that requires EVVM payment",
    timestamp: Date.now(),
    marketData: {
      btc: 45000,
      eth: 3000,
      trend: "up",
    },
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

    console.log(`\n🚗 Uber Ride Request Started (via EVVM): ${destination}`);
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

    console.log(`\n✅ Uber Ride Request Completed (via EVVM)`);

    res.json(parsedResult);

  } catch (error: any) {
    console.error(`\n❌ Uber Ride Request Failed (via EVVM):`, error);
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
    message: "EVVM payment server is running",
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to EVVM x402 API",
    endpoints: {
      "/health": "Free - Health check",
      "/weather": "Paid - Weather data (1 token unit via EVVM)",
      "/premium-data": "Paid - Premium market data (1 token unit via EVVM)",
      "/request-uber": "Paid - Uber ride request via AI agent (2 token units via EVVM)",
    },
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 EVVM x402 Server running at http://localhost:${PORT}`);
  console.log(`\n📍 Available endpoints:`);
  console.log(`   GET /health - Free endpoint`);
  console.log(`   GET /weather?location=<city> - Paid (1 token unit via EVVM)`);
  console.log(`   GET /premium-data - Paid (1 token unit via EVVM)`);
  console.log(`   POST /request-uber - Paid (2 token units via EVVM) - AI Agent Service`);
  console.log(`\n💰 Receiving payments at: ${receivingAddress}`);
  console.log(`🌐 Network: Sepolia testnet`);
  console.log(`📝 EVVM Contract: 0x9902984d86059234c3B6e11D5eAEC55f9627dD0f`);
  console.log(`💵 Token: USDC (${usdcSepoliaAddress})\n`);
});
