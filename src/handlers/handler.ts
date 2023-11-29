// import { FullBlockInfo } from './src/providers/consensus/typings'; // Adjust import paths as necessary
// import { AlertBody } from './src/providers/alertmanager/typings'; // Adjust import paths as necessary

const KEEP_MAX_SENT_ALERTS = 10;

type AlertBody = any;
type FullBlockInfo = any;

export abstract class WatcherHandler {
    private sentAlerts: AlertBody[];

    constructor() {
        this.sentAlerts = [];
    }

    // The '@unsync' decorator needs to be handled according to your project's async handling strategy.
    // If it is just to denote that the method is asynchronous, then you can use async keyword in TypeScript.
    async handle(watcher: any, head: FullBlockInfo): Promise<void> {

    };

    protected alertIsSent(current: AlertBody): boolean {
        return this.sentAlerts.some(sent => JSON.stringify(sent.annotations) === JSON.stringify(current.annotations));
    }

    protected sendAlert(watcher: any, alert: AlertBody): void {
        if (!this.alertIsSent(alert)) {
            watcher.alertmanager.sendAlerts([alert]);
            this.sentAlerts.push(alert);
            if (this.sentAlerts.length > KEEP_MAX_SENT_ALERTS) {
                this.sentAlerts.shift(); // Removes the first element
            }
        }
    }
}
