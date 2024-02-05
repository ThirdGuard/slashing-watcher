import { got } from 'got-cjs';
import { WEBHOOK_URL } from '../constants';
import { Finding, FindingSeverity, FindingType } from '../utils/finding';
import { Watcher } from '../watcher';

type FullBlockInfo = any;

export class Spiderman {

    async sendAlert(name: string, description: string, alertId: string, severity: FindingSeverity) {
        await this.sendWebhook([
            this.createFinding(name, description, new Date(Math.floor(Date.now() / 1000) * 1000).toString(), alertId, severity)
        ]);
    }

    protected async sendWebhook(alerts: any) {
        const res = await got.post(WEBHOOK_URL, { json: { alerts } })
        console.table(alerts.map((a: any) => {
            const { alertId, severity, timestamp } = a;
            return { alertId, severity, timestamp }
        }))
        if (res.ok) {
            // console.log("alert sent")
        }
    }

    protected createFinding(name: string, description: string, slotDesc: string, alertId: string, severity: number) {
        return {
            ...Finding.fromObject({
                name,
                description,
                alertId,
                severity,
                type: FindingType.Info,
                metadata: {
                    utcTime: new Date().toUTCString()
                },
            }), "source": {
                block: { hash: slotDesc }
            }
        }
    }
}

export abstract class WatcherHandler extends Spiderman {
    initialised: boolean = false;
    constructor() {
        super()
    }

    async handle(watcher: Watcher, head: FullBlockInfo): Promise<void> {
    };

    async sendInitHook() {
        if (!this.initialised) {
            await this.sendWebhook([
                this.createFinding("Slashing Agent Launched", "slashing handler has launched", new Date(Math.floor(Date.now() / 1000) * 1000).toString(), "LIDO-AGENT-LAUNCHED", FindingSeverity.Info)
            ]);
            this.initialised = true;
        }
    }
}
