
import { NETWORK_NAME, NODE_OPERATORS_REGISTRY_ADDRESS } from '../constants';
import { WatcherHandler } from './handler';
import keys from '../lido-validator-keys.json'
import { Watcher } from 'src/watcher';
import NODE_OPERATORS_REGISTRY_ABI from "../abi/NodeOperatorsRegistry.json";
import { ethers } from 'ethers';


type Duty = 'proposer' | 'attester';
type Owner = 'lido' | 'unknown' | 'not_indexed';

type BlockDetailsResponse = any;
type FullBlockInfo = any;

interface SlashingInfo {
    index: string;
    owner: Owner;
    duty: Duty;
    operator?: number;
}

export type PubKeyData = {
    nodeOperatorId: number;
    pubkeys: string[];
};

export class SlashingHandler extends WatcherHandler {

    override async handle(watcher: Watcher, head: FullBlockInfo): Promise<void> {
        const slashings: SlashingInfo[] = [];
        const validatorKeys = keys as unknown as PubKeyData[]

        head.message.body.proposer_slashings.forEach((proposerSlashing: any) => {
            // console.log("proposerSlashing", proposerSlashing)
            const signedHeader1 = proposerSlashing.signed_header_1;
            const proposerIndex = signedHeader1.message.proposer_index;
            const proposerKey = watcher.indexedValidatorsKeys[proposerIndex];

            // console.log("slashed proposer:", proposerIndex)
            // when the validator hasn't been indexed
            if (!proposerKey) {
                slashings.push({ index: proposerIndex, owner: 'not_indexed', duty: 'proposer' });
            } else {
                const nodeIndex = validatorKeys.findIndex(node => node.pubkeys.includes(proposerKey))
                // if the validator has been matched with a lido node operator
                if (nodeIndex >= 0) {
                    slashings.push({
                        index: proposerIndex,
                        owner: 'lido',
                        duty: 'proposer',
                        operator: validatorKeys[nodeIndex].nodeOperatorId,
                    });
                } else {
                    // when the validator is not associated with an entity
                    slashings.push({ index: proposerIndex, owner: 'unknown', duty: 'proposer' });
                }
            }
        });
        // console.log("head.message.body.attester_slashings", head.message.body.attester_slashings)
        head.message.body.attester_slashings.forEach((attesterSlashing: any) => {
            const attestation1 = attesterSlashing.attestation_1;
            const attestation2 = attesterSlashing.attestation_2;
            const attesters = new Set([...attestation1.attesting_indices].filter(index => attestation2.attesting_indices.includes(index)));

            // console.log("slashed attesters:", attesters)
            attesters.forEach(attester => {
                const attesterKey = watcher.indexedValidatorsKeys[attester];
                // when the validator hasn't been indexed
                if (!attesterKey) {
                    slashings.push({ index: attester, owner: 'not_indexed', duty: 'attester' });
                } else {
                    const nodeIndex = validatorKeys.findIndex(node => node.pubkeys.includes(attesterKey))
                    // if the validator has been matched with a lido node operator
                    if (nodeIndex >= 0) {
                        slashings.push({
                            index: attester,
                            owner: 'lido',
                            duty: 'attester',
                            operator: validatorKeys[nodeIndex].nodeOperatorId
                        });
                    } else {
                        // when the validator is not associated with an entity
                        slashings.push({ index: attester, owner: 'unknown', duty: 'attester' });
                    }
                }
            });
        });

        if (!slashings.length) {
            console.debug(`No slashings in block [${head.message.slot}]`);
        } else {
            console.info(`Slashings in block [${head.message.slot}]: ${slashings.length}`);
            this.sendAlerts(watcher, head, slashings);
        }

        // return slashings;
    }

    private async sendAlerts(watcher: Watcher, head: BlockDetailsResponse, slashings: SlashingInfo[]) {
        const allSlashings = slashings;
        // console.log(slashings)

        const nodeOperatorRegistry = new ethers.Contract(
            NODE_OPERATORS_REGISTRY_ADDRESS,
            NODE_OPERATORS_REGISTRY_ABI,
            watcher.provider,
        );
        // get all unique node operators id
        let operatorKeys: any = {}
        slashings.forEach(slash => {
            if (slash.operator) {
                operatorKeys[slash.operator] = true;
            }
        })
        const allOperators = Object.keys(operatorKeys);

        // map unique node operator ids to their name on-chain
        const operatorNames = await Promise.all(allOperators.map(op => nodeOperatorRegistry.getNodeOperator(op, true)))
        operatorNames.forEach((val, i) => {
            operatorKeys[allOperators[i]] = val.name;
        })
        // console.log(slashings)
        const lidoSlashings = slashings.filter(s => s.owner === 'lido');
        const unknownSlashings = slashings.filter(s => s.owner === 'unknown');
        const notIndexedSlashings = slashings.filter(s => s.owner === 'not_indexed');

        if (allSlashings.length > 0) {
            const summary = `slashings::total:${allSlashings.length} - lido:${lidoSlashings.length} - unknown:${unknownSlashings.length} - notIndexed:${notIndexedSlashings.length}`;
            let description = '';
            const byOperator: Record<string, SlashingInfo[]> = {};

            allSlashings.forEach(slashing => {
                const operator = slashing.operator ?? 'unknown';
                byOperator[operator] = byOperator[operator] || [];
                byOperator[operator].push(slashing);
            });

            Object.entries(byOperator).forEach(([operator, operatorSlashing]) => {
                description += `Operator: ${operatorKeys[operator] || "unknown"}:${operator} -`;
                const byDuty: Record<string, SlashingInfo[]> = {};

                operatorSlashing.forEach(slashing => {
                    byDuty[slashing.duty] = byDuty[slashing.duty] || [];
                    byDuty[slashing.duty].push(slashing);
                });

                Object.entries(byDuty).forEach(([duty, dutyGroup]) => {
                    description += ` Violated duty: ${duty} | Validators: `;
                    description += '[' + dutyGroup.map(slashing => `[${slashing.index}](http://${NETWORK_NAME}.beaconcha.in/validator/${slashing.index})`).join(', ') + ']';
                });
            });

            description += `\n\nslot: [${head.message.slot}](https://${NETWORK_NAME}.beaconcha.in/slot/${head.message.slot})`;
            console.log(summary)
            console.log(description)
            // const alert = new CommonAlert("HeadWatcherUserSlashing", "critical");
            // this.sendAlert(watcher, alert.buildBody(summary, description, ADDITIONAL_ALERTMANAGER_LABELS));
        }

    }
}