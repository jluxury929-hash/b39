/**
 * ===============================================================================
 * APEX PREDATOR v206.5 (FIXED - JS-UNIFIED)
 * ===============================================================================
 */

require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');
const Sentiment = require('sentiment');
const fs = require('fs');
const http = require('http');
const colors = require('colors'); // Explicitly named for functional use

// Force enable colors for container logs
colors.enable(); 

// ==========================================
// 0. CLOUD BOOT GUARD (Port Binding)
// ==========================================
const runHealthServer = () => {
    const port = process.env.PORT || 8080;
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            engine: "APEX_TITAN",
            version: "206.5-JS",
            status: "OPERATIONAL"
        }));
    }).listen(port, '0.0.0.0', () => {
        // SAFE LOGGING: Using colors.cyan() instead of .cyan
        console.log(colors.cyan(`[SYSTEM] Cloud Health Monitor active on Port ${port}`));
    });
};

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpc: process.env.ETH_RPC || "https://eth.llamarpc.com", multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.01", priority: "500.0" },
    BASE: { chainId: 8453, rpc: process.env.BASE_RPC || "https://mainnet.base.org", multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.005", priority: "1.6" },
    ARBITRUM: { chainId: 42161, rpc: process.env.ARB_RPC || "https://arb1.arbitrum.io/rpc", multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.003", priority: "1.0" }
};

class ApexOmniGovernor {
    constructor() {
        this.providers = {};
        this.wallets = {};
        this.multicallAbi = ["function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"];
        this.pairAbi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];

        for (const [name, config] of Object.entries(NETWORKS)) {
            try {
                const provider = new ethers.JsonRpcProvider(config.rpc, config.chainId, { staticNetwork: true });
                this.providers[name] = provider;
                if (process.env.PRIVATE_KEY) {
                    this.wallets[name] = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
                }
            } catch (e) { 
                console.log(colors.red(`[${name}] Init Error: ${e.message}`)); 
            }
        }
    }

    // --- SENSORY LOBE (MULTICALL) ---
    async getBulkReserves(networkName, poolAddresses) {
        const config = NETWORKS[networkName];
        const multicall = new ethers.Contract(config.multicall, this.multicallAbi, this.providers[networkName]);
        const itf = new ethers.Interface(this.pairAbi);

        const calls = poolAddresses.map(addr => ({
            target: addr,
            callData: itf.encodeFunctionData("getReserves")
        }));

        try {
            const [, returnData] = await multicall.aggregate(calls);
            return returnData.map(data => {
                const decoded = itf.decodeFunctionResult("getReserves", data);
                return [BigInt(decoded[0]), BigInt(decoded[1])]; // [reserve0, reserve1]
            });
        } catch (e) {
            console.error(colors.red(`[${networkName}] Multicall Failed: ${e.message}`));
            return [];
        }
    }

    // --- ANALYTICAL LOBE (CYCLIC MATH) ---
    calculateCyclicProfit(amountIn, reserves) {
        let current = amountIn;
        const feeNum = 997n; // 0.3% fee
        const feeDen = 1000n;

        for (const [resIn, resOut] of reserves) {
            if (resIn === 0n) return 0n;
            const amountInWithFee = current * feeNum;
            const numerator = amountInWithFee * resOut;
            const denominator = (resIn * feeDen) + amountInWithFee;
            current = numerator / denominator;
        }
        return current - amountIn;
    }

    // --- EXECUTIVE LOBE ---
    async run() {
        console.log(colors.bold(colors.yellow("╔════════════════════════════════════════════════════════╗")));
        console.log(colors.bold(colors.yellow("║    ⚡ APEX TITAN v206.5 | STARTUP SUCCESSFUL           ║")));
        console.log(colors.bold(colors.yellow("╚════════════════════════════════════════════════════════╝")));

        if (!process.env.PRIVATE_KEY) {
            console.error(colors.red("CRITICAL: PRIVATE_KEY missing in .env"));
            return;
        }

        // Example target pools for a triangle
        const trianglePools = ["0xPoolA", "0xPoolB", "0xPoolC"];

        while (true) {
            for (const name of Object.keys(NETWORKS)) {
                try {
                    const wallet = this.wallets[name];
                    const balance = await this.providers[name].getBalance(wallet.address);
                    
                    if (balance > ethers.parseEther("0.001")) {
                        const reserves = await this.getBulkReserves(name, trianglePools);
                        if (reserves.length >= 3) {
                            const profit = this.calculateCyclicProfit(balance / 2n, reserves);
                            if (profit > 0n) {
                                console.log(colors.green(`[${name}] ARB FOUND: +${ethers.formatEther(profit)} ETH`));
                            }
                        }
                    }
                } catch (e) { /* Passive Log suppression */ }
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// Ignition
runHealthServer();
const governor = new ApexOmniGovernor();
governor.run().catch(err => {
    console.error("FATAL ERROR IN RUN LOOP:");
    console.error(err);
    process.exit(1);
});
