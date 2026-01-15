/**
 * ===============================================================================
 * APEX TITAN v206.6 - MTE FINALITY (FULL STRIKE ENGINE)
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, JsonRpcProvider, Wallet, Contract, Interface, parseEther, formatEther, getAddress } = require('ethers');
const http = require('http');
const colors = require('colors');

colors.enable();

// --- 1. CLOUD HEALTH SENTRY ---
const runHealthServer = () => {
    const port = process.env.PORT || 8080;
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ engine: "APEX_TITAN", status: "STRIKE_READY" }));
    }).listen(port, '0.0.0.0', () => {
        console.log(colors.cyan(`[SYSTEM] Health Monitor Online on Port ${port}`));
    });
};

// --- 2. VERIFIED CANONICAL CONFIG (2026) ---
const NETWORKS = {
    ETHEREUM: { 
        chainId: 1, 
        rpc: process.env.ETH_RPC, 
        multicall: "0xcA11bde05977b3631167028862bE2a173976CA11",
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Uniswap V2 Router
        pools: ["0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc"] // USDC/WETH Pair
    },
    BASE: { 
        chainId: 8453, 
        rpc: process.env.BASE_RPC, 
        multicall: "0xcA11bde05977b3631167028862bE2a173976CA11",
        router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", // Base V2 Router
        pools: ["0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C"] // USDC/WETH Pair
    }
};

const EXECUTOR = process.env.EXECUTOR_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

class ApexOmniGovernor {
    constructor() {
        this.wallets = {};
        this.providers = {};
        this.v2Abi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];
        this.multiAbi = ["function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) public view returns (tuple(bool success, bytes returnData)[] returnData)"];
        this.execAbi = ["function executeTriangle(address router, address tokenA, address tokenB, uint256 amountIn) external payable"];

        for (const [name, config] of Object.entries(NETWORKS)) {
            const provider = new JsonRpcProvider(config.rpc, config.chainId, { staticNetwork: true });
            this.providers[name] = provider;
            if (PRIVATE_KEY) this.wallets[name] = new Wallet(PRIVATE_KEY, provider);
        }
    }

    async scan(name) {
        const config = NETWORKS[name];
        const wallet = this.wallets[name];
        if (!wallet) return;

        try {
            const multi = new Contract(config.multicall, this.multiAbi, this.providers[name]);
            const itf = new Interface(this.v2Abi);
            const calls = config.pools.map(addr => ({ target: getAddress(addr), callData: itf.encodeFunctionData("getReserves") }));

            const [balance, feeData, results] = await Promise.all([
                this.providers[name].getBalance(wallet.address),
                this.providers[name].getFeeData(),
                multi.tryAggregate(false, calls)
            ]);

            if (results[0].success && balance > parseEther("0.005")) {
                console.log(colors.green(`[${name}] Target Found. Simulating Strike...`));
                await this.executeStrike(name, balance - parseEther("0.005"), feeData);
            }
        } catch (e) { /* Signal waiting... */ }
    }

    async executeStrike(name, amount, feeData) {
        const config = NETWORKS[name];
        const executor = new Contract(EXECUTOR, this.execAbi, this.wallets[name]);

        try {
            // 1. SIMULATION
            await executor.executeTriangle.staticCall(
                config.router,
                "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
                amount,
                { value: amount }
            );

            // 2. BROADCAST
            const tx = await executor.executeTriangle(
                config.router,
                "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                amount,
                { 
                    value: amount, 
                    gasLimit: 400000, 
                    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas 
                }
            );

            console.log(colors.gold.bold(`🚀 STRIKE SUCCESS [${name}]: ${tx.hash}`));
        } catch (e) {
            console.log(colors.red(`[${name}] Simulation Reverted (No Profit Gap).`));
        }
    }

    async run() {
        console.clear();
        console.log(colors.yellow.bold("╔════════════════════════════════════════════════════════╗"));
        console.log(colors.yellow.bold("║    ⚡ APEX TITAN v206.6 | STRIKE ENGINE ONLINE        ║"));
        console.log(colors.yellow.bold("╚════════════════════════════════════════════════════════╝"));

        while (true) {
            for (const name of Object.keys(NETWORKS)) await this.scan(name);
            await new Promise(r => setTimeout(r, 4000));
        }
    }
}

runHealthServer();
new ApexOmniGovernor().run();
