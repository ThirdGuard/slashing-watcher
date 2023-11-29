
import { NETWORK_NAME } from '../constants';
import { WatcherHandler } from './handler';

type Duty = 'proposer' | 'attester';
type Owner = 'user' | 'other' | 'unknown';

type BlockDetailsResponse = any;
type FullBlockInfo = any;

interface SlashingInfo {
    index: string;
    owner: Owner;
    duty: Duty;
    operator?: string;
}

export class SlashingHandler extends WatcherHandler {

    override async handle(watcher: any, head: FullBlockInfo): Promise<void> {
        const slashings: SlashingInfo[] = [];

        head.message.body.proposer_slashings.forEach((proposerSlashing: any) => {
            const signedHeader1 = proposerSlashing.signed_header_1;
            const proposerIndex = signedHeader1.message.proposer_index;
            // const proposerKey = watcher.indexedValidatorsKeys.get(proposerIndex);
            const proposerKey = null;

            console.log("slashed proposer:", proposerIndex)
            if (!proposerKey) {
                slashings.push({ index: proposerIndex, owner: 'unknown', duty: 'proposer' });
            } else {
                const userKey = watcher.userKeys.get(proposerKey);
                if (userKey) {
                    slashings.push({
                        index: proposerIndex,
                        owner: 'user',
                        duty: 'proposer',
                        operator: userKey.operatorName,
                    });
                } else {
                    slashings.push({ index: proposerIndex, owner: 'other', duty: 'proposer' });
                }
            }
        });

        head.message.body.attester_slashings.forEach((attesterSlashing: any) => {
            const attestation1 = attesterSlashing.attestation_1;
            const attestation2 = attesterSlashing.attestation_2;
            const attesters = new Set([...attestation1.attesting_indices].filter(index => attestation2.attesting_indices.includes(index)));

            console.log("slashed attesters:", attesters)
            attesters.forEach(attester => {
                //@todo
                // const attesterKey = watcher.indexedValidatorsKeys.get(attester);
                const attesterKey = null;
                if (!attesterKey) {
                    slashings.push({ index: attester, owner: 'unknown', duty: 'attester' });
                } else {
                    const userKey = watcher.userKeys.get(attesterKey);
                    if (userKey) {
                        slashings.push({
                            index: attester,
                            owner: 'user',
                            duty: 'attester',
                            operator: userKey.operatorName
                        });
                    } else {
                        slashings.push({ index: attester, owner: 'other', duty: 'attester' });
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

    private sendAlerts(watcher: any, head: BlockDetailsResponse, slashings: SlashingInfo[]): void {
        const userSlashings = slashings;
        // const userSlashings = slashings.filter(s => s.owner === 'user');
        const unknownSlashings = slashings.filter(s => s.owner === 'unknown');
        const otherSlashings = slashings.filter(s => s.owner === 'other');

        if (userSlashings.length > 0) {
            const summary = `🚨🚨🚨 ${userSlashings.length} Our validators were slashed! 🚨🚨🚨`;
            let description = '';
            const byOperator: Record<string, SlashingInfo[]> = {};

            userSlashings.forEach(slashing => {
                const operator = slashing.operator ?? 'unknown';
                byOperator[operator] = byOperator[operator] || [];
                byOperator[operator].push(slashing);
            });

            Object.entries(byOperator).forEach(([operator, operatorSlashing]) => {
                description += `\n${operator} -`;
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
            console.log(summary, description)
            // const alert = new CommonAlert("HeadWatcherUserSlashing", "critical");
            // this.sendAlert(watcher, alert.buildBody(summary, description, ADDITIONAL_ALERTMANAGER_LABELS));
        }

    }
}