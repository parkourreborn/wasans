import { plats, TrialName } from "./trials";

export default function calculateScore(wr: number, time: number, trial: TrialName) {
    if (time <= plats[trial]) {
        return Math.max(Math.min(Math.pow(wr / time, 3), 1), 0.3);
    }

    return Math.min(0.3 * (plats[trial] / time), 0.3);
}