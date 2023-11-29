import { SlashingHandler } from "./handlers/slashing";
import { Watcher } from "./watcher";

function main() {
    const handlers: any = [
        new SlashingHandler(),
    ];
    new Watcher(handlers).run();
}

main()