import { plats, TrialName } from "./trials";

export default function calculateScore(wr: number, time: number, trial: TrialName) {
    return Math.min(
        Math.pow(wr / time, 3),
    1)
}