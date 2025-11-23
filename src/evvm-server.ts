import express from "express";
import { evvmPaymentMiddleware } from "@evvm/x402-middleware";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 4022;

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
    },
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 EVVM x402 Server running at http://localhost:${PORT}`);
  console.log(`\n📍 Available endpoints:`);
  console.log(`   GET /health - Free endpoint`);
  console.log(`   GET /weather?location=<city> - Paid (1 token unit via EVVM)`);
  console.log(`   GET /premium-data - Paid (1 token unit via EVVM)`);
  console.log(`\n💰 Receiving payments at: ${receivingAddress}`);
  console.log(`🌐 Network: Sepolia testnet`);
  console.log(`📝 EVVM Contract: 0x9902984d86059234c3B6e11D5eAEC55f9627dD0f`);
  console.log(`💵 Token: USDC (${usdcSepoliaAddress})\n`);
});
