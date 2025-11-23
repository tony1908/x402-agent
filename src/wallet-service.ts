import { Coinbase, Wallet } from "@coinbase/coinbase-sdk";
import { createWalletClient, http } from "viem";
import { baseSepolia, polygonAmoy } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "dotenv";

config();

/**
 * Backend Wallet Service
 * This service manages wallets server-side for secure payment handling
 * Supports both CDP Wallet SDK (Base) and private key mode (Polygon)
 */
export class WalletService {
  private wallet: Wallet | null = null;
  private walletAddress: string | null = null;
  private privateKey: `0x${string}` | null = null;
  private usePrivateKeyMode: boolean = false;

  /**
   * Initialize the wallet service
   */
  async initialize(): Promise<void> {
    if (this.wallet || this.privateKey) {
      return; // Already initialized
    }

    // Check if we should use private key mode (for Polygon)
    if (process.env.POLYGON_PRIVATE_KEY) {
      console.log("🔑 Using private key mode for Polygon...");
      this.usePrivateKeyMode = true;
      this.privateKey = process.env.POLYGON_PRIVATE_KEY as `0x${string}`;

      // Derive address from private key
      const account = privateKeyToAccount(this.privateKey);
      this.walletAddress = account.address;
      console.log(`✅ Wallet initialized: ${this.walletAddress}`);
      return;
    }

    // Fall back to CDP Wallet SDK (for Base)
    if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
      throw new Error(
        "Please set either POLYGON_PRIVATE_KEY or (CDP_API_KEY_ID + CDP_API_KEY_SECRET) in your .env file"
      );
    }

    // Configure Coinbase SDK
    Coinbase.configure({
      apiKeyName: process.env.CDP_API_KEY_ID!,
      privateKey: process.env.CDP_API_KEY_SECRET!,
    });

    // Try to load wallet from saved data (includes seed for private key access)
    if (process.env.CDP_WALLET_DATA) {
      try {
        console.log("📂 Importing wallet from saved data...");
        const walletData = JSON.parse(process.env.CDP_WALLET_DATA);
        this.wallet = await Wallet.import(walletData);
        console.log("✅ Wallet imported successfully");
      } catch (error) {
        console.error("❌ Failed to import wallet:", (error as Error).message);
        console.log("Creating new wallet instead...");
        this.wallet = await Wallet.create();
      }
    } else {
      // Create new wallet
      console.log("🆕 Creating new wallet...");
      this.wallet = await Wallet.create();

      // Export wallet data for saving
      const walletData = this.wallet.export();
      console.log("\n" + "═".repeat(70));
      console.log("⚠️  IMPORTANT: Save this wallet data to your .env file!");
      console.log("═".repeat(70));
      console.log(`CDP_WALLET_ID=${this.wallet.getId()}`);
      console.log(`CDP_WALLET_DATA='${JSON.stringify(walletData)}'`);
      console.log("═".repeat(70) + "\n");
    }

    const address = await this.wallet.getDefaultAddress();
    this.walletAddress = address.getId();
    console.log(`✅ Wallet initialized: ${this.walletAddress}`);
  }

  /**
   * Get or create the wallet (auto-initialize if needed)
   */
  async getWallet(): Promise<Wallet> {
    if (!this.wallet && !this.usePrivateKeyMode) {
      await this.initialize();
    }
    if (this.usePrivateKeyMode) {
      throw new Error("Wallet object not available in private key mode");
    }
    return this.wallet!;
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string> {
    if (!this.wallet && !this.privateKey) {
      await this.initialize();
    }
    return this.walletAddress!;
  }

  /**
   * Get wallet ID
   */
  async getWalletId(): Promise<string> {
    if (this.usePrivateKeyMode) {
      return this.walletAddress || "";
    }
    if (!this.wallet) {
      await this.initialize();
    }
    const id = this.wallet!.getId();
    return id || "";
  }

  /**
   * Get balance for a specific asset
   */
  async getBalance(asset: string = "usdc"): Promise<string> {
    if (this.usePrivateKeyMode) {
      // Balance checking not implemented for private key mode
      return "N/A";
    }

    if (!this.wallet) {
      await this.initialize();
    }

    try {
      const address = await this.wallet!.getDefaultAddress();
      const balance = await address.getBalance(asset);
      return balance.toString();
    } catch (error) {
      return "0";
    }
  }

  /**
   * Export private key for use with x402-axios
   */
  async getPrivateKey(): Promise<`0x${string}`> {
    if (!this.wallet && !this.privateKey) {
      await this.initialize();
    }

    // If using private key mode, return it directly
    if (this.usePrivateKeyMode && this.privateKey) {
      return this.privateKey;
    }

    // Otherwise export from CDP wallet
    const address = await this.wallet!.getDefaultAddress();
    const privateKey = await address.export();
    return privateKey as `0x${string}`;
  }

  /**
   * Create a viem wallet client for signing transactions
   */
  async createViemWalletClient(network: "base-sepolia" | "polygon-amoy" = "polygon-amoy") {
    if (!this.wallet && !this.privateKey) {
      await this.initialize();
    }

    let privateKey: `0x${string}`;

    // Get private key from either mode
    if (this.usePrivateKeyMode && this.privateKey) {
      privateKey = this.privateKey;
    } else {
      const address = await this.wallet!.getDefaultAddress();
      privateKey = (await address.export()) as `0x${string}`;
    }

    // Create viem account and wallet client
    const account = privateKeyToAccount(privateKey);
    const chain = network === "polygon-amoy" ? polygonAmoy : baseSepolia;
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });

    return walletClient;
  }

  /**
   * Display wallet information
   */
  async displayWalletInfo(): Promise<void> {
    if (!this.wallet && !this.privateKey) {
      await this.initialize();
    }

    console.log("\n" + "═".repeat(70));
    console.log("💼 BACKEND WALLET SERVICE - ACCOUNT INFO");
    console.log("═".repeat(70));
    console.log(`📍 Address: ${this.walletAddress}`);

    if (this.usePrivateKeyMode) {
      console.log(`🔑 Mode: Private Key (Polygon)`);
      console.log(`🌐 Network: Polygon Amoy (Testnet)`);
      console.log(`🔗 View on explorer: https://amoy.polygonscan.com/address/${this.walletAddress}`);
    } else {
      console.log(`🆔 Wallet ID: ${this.wallet!.getId()}`);
      console.log(`🌐 Network: Base Sepolia (Testnet)`);

      // Get balances
      const ethBalance = await this.getBalance("eth");
      const usdcBalance = await this.getBalance("usdc");

      console.log(`💰 ETH Balance: ${ethBalance} ETH`);
      console.log(`💰 USDC Balance: ${usdcBalance} USDC`);
      console.log(`🔗 View on explorer: https://sepolia.basescan.org/address/${this.walletAddress}`);
    }

    console.log("═".repeat(70) + "\n");
  }
}

// Export singleton instance
export const walletService = new WalletService();
