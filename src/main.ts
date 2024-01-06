import { SlashingHandler } from "./handlers/slashing";
import { Watcher } from "./watcher";
import { ethers } from "ethers";


const RPC_URL = "INSERT_URL_HERE"
export const ethersProvider = new ethers.providers.JsonRpcProvider(RPC_URL)

function main() {
    const handlers: any = [
        new SlashingHandler(ethersProvider),
    ];
    new Watcher(handlers, ethersProvider).run();
}

main()