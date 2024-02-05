import { RPC_URL, SLOTS_RANGE } from "./constants";
import { SlashingHandler } from "./handlers/slashing";
import { Watcher } from "./watcher";
import { ethers } from "ethers";


export const ethersProvider = new ethers.providers.JsonRpcProvider(RPC_URL)

function main() {
    const handlers: any = [
        new SlashingHandler(ethersProvider),
    ];
    new Watcher(handlers, ethersProvider).run(SLOTS_RANGE);
}

main()