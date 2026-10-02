import { bronze, plats, TrialName } from "./trials";

export default function calculateScore(wr: number, time: number, trial: TrialName) {
    if (Math.pow((wr / time), 3) > 1) {
        return 1;
    }


    if (time > bronze[trial]) {
        return 0;
    }

    if (time > plats[trial]) {
        return 0.3 * ((bronze[trial] - time) / (bronze[trial] - plats[trial]));
    }

    return (
        0.3 + 0.7 *
        ((Math.pow((wr / time), 3) - Math.pow((wr / plats[trial]), 3)) /
            (1 - Math.pow((wr / plats[trial]), 3)))
    )
}

/*
IF(time>bronze, 0, 
IF(time>platinum, 0.3*((bronze-time)/(bronze-platinum)), 
0.3+0.7*(((wr/time)^3-(wr/platinum)^3)/(1-(wr/platinum)^3))))), 0) 
*/