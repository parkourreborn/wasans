import { plats, TrialName } from "./trials";

export default function calculateScore(wr: number, time: number, trial: TrialName) {
    if (Math.pow((wr / time), 3) > 1) {
        return 1;
    }

    if (time > plats[trial]) {
        return 0.3 * (plats[trial] / time);
    }

    return (
        0.3 + 0.7 *
        ((Math.pow((wr / time), 3) - Math.pow((wr / plats[trial]), 3)) /
            (1 - Math.pow((wr / plats[trial]), 3)))
    )
}

/*
=iferror(IF((wr/time)^3>1,"no", <-- prevent time input being lower than w
IF(time>platinum, <-- check if slower than platinum
0.3*(platinum/time), <-- 0.3 maximum non-exponential calculation for times below plat
0.3 + 0.7*(((wr/time)^3 - (wr/platinum)^3) / (1-(wr/platinum )^3)))), 0) <-- dumbshit ohhhhhhhhhhhhhhhhhhh
*/