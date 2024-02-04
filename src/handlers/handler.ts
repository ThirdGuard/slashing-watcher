import { got } from 'got-cjs';
import { WEBHOOK_URL } from '../constants';
import { Finding, FindingType } from '../utils/finding';
import { Watcher } from '../watcher';

type FullBlockInfo = any;

export abstract class WatcherHandler {

    constructor() { }

    async handle(watcher: Watcher, head: FullBlockInfo): Promise<void> {
    };

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
