
import { NETWORK_NAME, NODE_OPERATORS_REGISTRY_ADDRESS } from '../constants';
import { WatcherHandler } from './handler';
import { Watcher } from 'src/watcher';
import NODE_OPERATORS_REGISTRY_ABI from "../abi/NodeOperatorsRegistry.json";
import { ethers } from 'ethers';
import { KeyCollector } from '../utils/lido-keys';
import { Finding, FindingSeverity } from '../utils/finding';
import { AlertManager, ThresholdAlertManager } from '../utils/alertManager';


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

    lidoNodeOperatorRegistry: ethers.Contract;
    lidoKeyClass: KeyCollector;
    // if 100 validators are slashed within a 1 hour period
    lidoCriticalAlerter: ThresholdAlertManager = new ThresholdAlertManager(
        { limit: 100, timePeriod: 60 * 60 }
    )
    devNotIndexedAlerter: AlertManager = new AlertManager(
        { severity: 5, interval: 60 * 60, alert_id: "ADMIN_NOT_INDEXED_SLASHED" }
    )
    // if 1 validator is slashed, send a critical alert with a 1 hr cooldown
    devLidoCriticalAlerter: AlertManager = new AlertManager(
        { severity: 5, interval: 60 * 60, alert_id: "ADMIN_LIDO_SLASHED" }
    )

    constructor(provider: ethers.providers.Provider) {
        super()
        this.lidoNodeOperatorRegistry = new ethers.Contract(
            NODE_OPERATORS_REGISTRY_ADDRESS,
            NODE_OPERATORS_REGISTRY_ABI,
            provider,
        );
        this.lidoKeyClass = new KeyCollector(this.lidoNodeOperatorRegistry);
    }

    override async handle(watcher: Watcher, head: FullBlockInfo): Promise<void> {
        const slashings: SlashingInfo[] = [];
        const validatorKeys = (await this.lidoKeyClass.getLidoKeys() as PubKeyData[])
        const indexedValidatorsKeys = (await watcher.validatorSlots.getValidatorSlots() as Record<string, string>);

        head.message.body.proposer_slashings.forEach((proposerSlashing: any) => {
            // console.log("proposerSlashing", proposerSlashing)
            const signedHeader1 = proposerSlashing.signed_header_1;
            const proposerIndex = signedHeader1.message.proposer_index;
            const proposerKey = indexedValidatorsKeys[proposerIndex];

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
                const attesterKey = indexedValidatorsKeys[attester];
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
            // console.info(`Slashings in block [${head.message.slot}]: ${slashings.length}`);
            await this.processSlashings(watcher, head, slashings);
        }

        // return slashings;
    }

    // every lido slashing has a critical dev alert
    // every 100 lido slashings in a 1 hr period has a critical customer alert
    // every lido slashing has a info alert
    // every not_indexed slashing has a critical dev alert
    private async processSlashings(watcher: Watcher, head: BlockDetailsResponse, slashings: SlashingInfo[]) {
        let alerts: any[] = []

        const lidoSlashings = slashings.filter(s => s.owner === 'lido');
        const unknownSlashings = slashings.filter(s => s.owner === 'unknown');
        const notIndexedSlashings = slashings.filter(s => s.owner === 'not_indexed');
        const summary = `slot:${head.message.slot} - slashings::total:${lidoSlashings.length} - lido:${lidoSlashings.length} - unknown:${unknownSlashings.length} - notIndexed:${notIndexedSlashings.length}`;
        console.log(summary)
        const lidoFindings = await this.processLidoSlashings(watcher, head, lidoSlashings)
        const notIndexedFindings = this.processNotIndexedSlashings(watcher, head, notIndexedSlashings)
        const unknownFindings = this.processUnknownSlashings(head, unknownSlashings)
        alerts = [...alerts, ...unknownFindings, ...notIndexedFindings, ...lidoFindings];
        if (alerts.length) {
            await this.sendWebhook(alerts);
        }
    }


    private async processLidoSlashings(watcher: Watcher, head: BlockDetailsResponse, lidoSlashings: SlashingInfo[]) {
        // map unique node operator ids to their name on-chain
        const operatorNames = await Promise.all(lidoSlashings.map(s => this.lidoNodeOperatorRegistry.getNodeOperator(s.operator, true)))
        const operatorNamesObj: Record<any, string> = operatorNames.reduce((acc, val, i) => {
            acc[(lidoSlashings[i].operator as number)] = val.name
            return acc
        }, {})
        // console.log(slashings)
        let findings = []

        if (lidoSlashings.length > 0) {
            const byOperator: Record<string, { slashings: SlashingInfo[], attester: SlashingInfo[], proposer: SlashingInfo[] }> = {};

            lidoSlashings.forEach(slashing => {
                const operator = slashing.operator ?? 'unknown';
                byOperator[operator] = byOperator[operator] || { slashings: [], attester: [], proposer: [] };
                byOperator[operator].slashings.push(slashing);
                byOperator[operator][slashing.duty].push(slashing);
            });

            const description = this.createDescription(byOperator, operatorNamesObj)

            // console.log(description)
            let slotDesc = `[${head.message.slot}](https://${NETWORK_NAME}.beaconcha.in/slot/${head.message.slot})`
            // console.log("slot timestamp", watcher.getSlotTimestamp(head.message.slot))
            let now = watcher.getSlotTimestamp(head.message.slot);
            // send an informational alert for any slashing
            findings.push(this.createFinding(
                `${lidoSlashings.length} LIDO Validators Slashed`,
                description, slotDesc, "LIDO_VALIDATORS_SLASHED", FindingSeverity.Info
            ))
            // escalate a critical alert if significant slashings occur
            if (this.lidoCriticalAlerter.shouldAlert(now, lidoSlashings.length)) {
                findings.push(this.lidoCriticalAlerter.sendAlert(
                    now,
                    this.createFinding(
                        `Significant LIDO Validators Slashed`,
                        `${this.lidoCriticalAlerter.criticalThreshold.count} lido validators slashed within ${now - this.lidoCriticalAlerter.criticalThreshold.firstCountTime} seconds`, slotDesc, "SIGNIFICANT_LIDO_VALIDATORS_SLASHED", FindingSeverity.Critical
                    )
                ))
            }
            // send critical alert to devs
            if (this.devLidoCriticalAlerter.shouldAlert(now)) {
                findings.push(this.devLidoCriticalAlerter.sendAlert(
                    now,
                    this.createFinding(
                        `${lidoSlashings.length} LIDO Validators Slashed`,
                        description, slotDesc, this.devLidoCriticalAlerter.alertId, FindingSeverity.Critical
                    )
                ))
            }
        }
        return findings
    }

    private processUnknownSlashings(head: BlockDetailsResponse, unknownSlashings: SlashingInfo[]) {
        let findings = []
        if (unknownSlashings.length > 0) {
            const byOperator: Record<string, { slashings: SlashingInfo[], attester: SlashingInfo[], proposer: SlashingInfo[] }> = {};

            unknownSlashings.forEach(slashing => {
                const operator = 'unknown';
                byOperator[operator] = byOperator[operator] || { slashings: [], attester: [], proposer: [] };
                byOperator[operator].slashings.push(slashing);
                byOperator[operator][slashing.duty].push(slashing);
            });
            const description = this.createDescription(byOperator, {})

            // console.log(description)
            let slotDesc = `[${head.message.slot}](https://${NETWORK_NAME}.beaconcha.in/slot/${head.message.slot})`
            if (unknownSlashings.length > 0) {
                findings.push(this.createFinding(
                    `${unknownSlashings.length} Unknown Validators Slashed`,
                    description, slotDesc, "UNKNOWN_VALIDATORS_SLASHED", FindingSeverity.Info
                ))
            }
        }
        return findings
    }

    private processNotIndexedSlashings(watcher: Watcher, head: BlockDetailsResponse, notIndexedSlashings: SlashingInfo[]) {
        let findings = []
        if (notIndexedSlashings.length > 0) {
            const byOperator: Record<string, { slashings: SlashingInfo[], attester: SlashingInfo[], proposer: SlashingInfo[] }> = {};

            notIndexedSlashings.forEach(slashing => {
                const operator = 'not_indexed';
                byOperator[operator] = byOperator[operator] || { slashings: [], attester: [], proposer: [] };
                byOperator[operator].slashings.push(slashing);
                byOperator[operator][slashing.duty].push(slashing);
            });

            const description = this.createDescription(byOperator, {})

            // console.log(description)
            let now = watcher.getSlotTimestamp(head.message.slot);
            let slotDesc = `[${head.message.slot}](https://${NETWORK_NAME}.beaconcha.in/slot/${head.message.slot})`
            if (notIndexedSlashings.length > 0) {
                findings.push(this.createFinding(
                    `${notIndexedSlashings.length} Non-Indexed Validators Slashed`,
                    description, slotDesc, "NON_INDEXED_VALIDATORS_SLASHED", FindingSeverity.Info
                ))
                if (this.devNotIndexedAlerter.shouldAlert(now)) {
                    findings.push(Finding.fromObject(this.devNotIndexedAlerter.sendAlert(
                        now,
                        this.createFinding(
                            `${notIndexedSlashings.length} Non-Indexed Validators Slashed`,
                            description, slotDesc, "ADMIN_NOT_INDEXED_SLASHED", FindingSeverity.Critical
                        )
                    )))
                }
            }
        }
        return findings
    }

    // create the description of the slashing alert with the operators etc
    createDescription(byOperator: Record<string, {
        slashings: SlashingInfo[];
        attester: SlashingInfo[];
        proposer: SlashingInfo[];
    }>, operatorNames: Record<any, string>) {
        let description = '';
        Object.entries(byOperator).forEach(([operator, operatorSlashing]) => {
            description += `Operator: ${operatorNames[operator] || "unknown"}:${operator} -`;

            if (operatorSlashing.attester.length) {
                description += ` Violated duty: attester | Validators: `;
                description += '[' + operatorSlashing.attester.map(slashing => `${slashing.index}`).join(', ') + ']';
                // (http://${NETWORK_NAME}.beaconcha.in/validator/${slashing.index})
            }
            if (operatorSlashing.proposer.length) {
                description += ` Violated duty: proposer | Validators: `;
                description += '[' + operatorSlashing.proposer.map(slashing => `${slashing.index}`).join(', ') + ']';
                // (http://${NETWORK_NAME}.beaconcha.in/validator/${slashing.index})
            }
        });
        return description
    }
}