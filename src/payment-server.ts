import express from "express";
import { paymentMiddleware } from "x402-express";

const app = express();
const PORT = 4021;

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
  console.log(`\n💰 Receiving payments at: ${RECEIVER_ADDRESS}`);
  console.log(`🌐 Network: Base Sepolia (testnet)`);
  console.log(`\n📝 Try it: curl http://localhost:${PORT}/weather?location=Miami\n`);
});
