import { Cron } from "croner";
import { Watcher } from "./watcher";
import { KeyCollector, NODE_OPERATORS_REGISTRY_ADDRESS } from './utils/lido-keys';
import { ethers } from "ethers";
import NODE_OPERATORS_REGISTRY_ABI from "./abi/NodeOperatorsRegistry.json";

const RPC_URL = "INSERT_URL_HERE"
export const ethersProvider = new ethers.providers.JsonRpcProvider(RPC_URL)

const indexer = Cron("*/30 * * * *", async () => {
    try {
        await Promise.all([indexLidoKeys(), new Watcher([], ethersProvider).indexValidators()])
    } catch (e) {
        console.log(e)
    }
});

indexer.trigger()

async function indexLidoKeys() {
    const nodeOperatorRegistry = new ethers.Contract(
        NODE_OPERATORS_REGISTRY_ADDRESS,
        NODE_OPERATORS_REGISTRY_ABI,
        ethersProvider,
    );
    const keyCollector = new KeyCollector(nodeOperatorRegistry)
    const validatorKeys = await keyCollector.getAllValidatorKeys()
    console.time("writeLido")
    await keyCollector.writeKeysToFile(validatorKeys)
    console.timeEnd("writeLido")
    //@todo send notification that collection has completed
}