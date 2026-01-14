/**
 * ===============================================================================
 * APEX PREDATOR v204.7 (FIXED - JS-UNIFIED)
 * ===============================================================================
 */

require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');
const Sentiment = require('sentiment');
const fs = require('fs');
const http = require('http');
require('colors');

// ==========================================
// 0. CLOUD BOOT GUARD (Port Binding)
// ==========================================
const runHealthServer = () => {
    const port = process.env.PORT || 8080;
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            engine: "APEX_TITAN",
            version: "204.7-JS-FIXED",
            status: "OPERATIONAL"
        }));
    }).listen(port, '0.0.0.0', () => {
        console.log(`[SYSTEM] Cloud Health Monitor active on Port ${port}`.cyan);
    });
};

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpc: process.env.ETH_RPC || "https://eth.llamarpc.com", multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.005", priority: "500.0" },
    BASE: { chainId: 8453, rpc: process.env.BASE_RPC || "https://mainnet.base.org", multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.0035", priority: "1.6" },
    ARBITRUM: { chainId: 42161, rpc: process.env.ARB_RPC || "https://arb1.arbitrum.io/rpc", multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.002", priority: "1.0" }
};

class ApexOmniGovernor {
    constructor() {
        this.providers = {};
        this.wallets = {};
        
        for (const [name, config] of Object.entries(NETWORKS)) {
            const provider = new ethers.JsonRpcProvider(config.rpc, config.chainId, { staticNetwork: true });
            this.providers[name] = provider;
            if (process.env.PRIVATE_KEY) {
                this.wallets[name] = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
            }
        }
    }

    async getBulkReserves(networkName, poolAddresses) {
        const config = NETWORKS[networkName];
        const abi = ["function getReserves() external view returns (uint112, uint112, uint32)"];
        const multicallAbi = ["function aggregate(tuple(address target, bytes callData)[] calls) external view returns (uint256 blockNumber, bytes[] returnData)"];
        
        const contract = new ethers.Contract(config.multicall, multicallAbi, this.providers[networkName]);
        const itf = new ethers.Interface(abi);

        const calls = poolAddresses.map(addr => ({
            target: addr,
            callData: itf.encodeFunctionData("getReserves")
        }));

        try {
            const [, returnData] = await contract.aggregate(calls);
            return returnData.map(data => itf.decodeFunctionResult("getReserves", data));
        } catch (e) {
            console.error(`[${networkName}] Multicall Failed: ${e.message}`.red);
            return [];
        }
    }

    calculateCyclicProfit(amountIn, reservesArray) {
        let currentAmount = amountIn;
        const feeMultiplier = 997n; 

        for (const reserve of reservesArray) {
            const [reserveIn, reserveOut] = reserve;
            const amountInWithFee = currentAmount * feeMultiplier;
            const numerator = amountInWithFee * reserveOut;
            const denominator = (reserveIn * 1000n) + amountInWithFee;
            currentAmount = numerator / denominator;
        }
        return currentAmount - amountIn;
    }

    // FIXED: Added missing calculateMaxStrike logic
    async calculateMaxStrike(networkName) {
        const provider = this.providers[networkName];
        const wallet = this.wallets[networkName];
        if (!wallet) return null;

        try {
            const balance = await provider.getBalance(wallet.address);
            const moat = ethers.parseEther(NETWORKS[networkName].moat);
            if (balance <= moat) return null;

            return { loan: balance - moat }; // Simple version for demonstration
        } catch (e) { return null; }
    }

    async strike(networkName, pools) {
        const m = await this.calculateMaxStrike(networkName);
        if (!m || !m.loan) return;

        const reserves = await this.getBulkReserves(networkName, pools);
        if (reserves.length === 0) return;

        const profit = this.calculateCyclicProfit(m.loan, reserves);
        if (profit > 0n) {
            console.log(`[${networkName}] ARBITRAGE DETECTED: +${ethers.formatEther(profit)} ETH`.green);
        }
    }

    // FIXED: The missing run() function that caused your error
    async run() {
        console.log("⚡ APEX TITAN STARTING...".gold.bold);
        
        // Define your target pools here (Example addresses)
        const targetPools = [
            "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC/WETH example
            "0x..." 
        ];

        while (true) {
            for (const networkName of Object.keys(NETWORKS)) {
                await this.strike(networkName, targetPools);
            }
            await new Promise(r => setTimeout(r, 5000)); // Scan every 5 seconds
        }
    }
}

runHealthServer();
const governor = new ApexOmniGovernor();
// Ignition
governor.run().catch(err => {
    console.error("FATAL ERROR IN RUN LOOP:".red, err);
});
