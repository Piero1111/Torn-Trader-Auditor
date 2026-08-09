import { CONFIG } from "../config.js";

export class RatioLearner {

    calculateObservedRatio(buyPrice, itemValue) {

        if (
            !Number.isFinite(buyPrice) ||
            !Number.isFinite(itemValue) ||
            itemValue <= 0
        ) {
            return null;
        }

        return buyPrice / itemValue;
    }


    update(previousRatio, observedRatio) {

        if (!Number.isFinite(observedRatio)) {
            return previousRatio;
        }

        if (!Number.isFinite(previousRatio)) {
            return observedRatio;
        }

        return (
            CONFIG.EWMA_ALPHA * observedRatio
            +
            (1 - CONFIG.EWMA_ALPHA) * previousRatio
        );
    }
}