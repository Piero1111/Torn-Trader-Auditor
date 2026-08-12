export class MarketValueAnalyzer {

    analyze({
        market,
        bazaars
    }) {

        const marketValue =
            this.extractMarketValue(
                market
            );

        const bazaarValue =
            this.extractBazaarReferenceValue(
                bazaars
            );

        if (
            marketValue === null &&
            bazaarValue === null
        ) {
            return null;
        }

        const marketQuality =
            marketValue === null
                ? 0
                : this.calculateMarketQuality(
                    market
                );

        const bazaarQuality =
            bazaarValue === null
                ? 0
                : this.calculateBazaarQuality(
                    bazaars
                );

        let marketWeight =
            marketValue === null
                ? 0
                : marketQuality;

        let bazaarWeight =
            bazaarValue === null
                ? 0
                : bazaarQuality;

        if (
            marketValue !== null &&
            bazaarValue !== null
        ) {
            const totalRawWeight =
                marketWeight +
                bazaarWeight;

            if (totalRawWeight > 0) {
                marketWeight =
                    marketWeight /
                    totalRawWeight;

                bazaarWeight =
                    bazaarWeight /
                    totalRawWeight;
            } else {
                marketWeight = 0.5;
                bazaarWeight = 0.5;
            }
        } else if (
            marketValue !== null
        ) {
            marketWeight = 1;
            bazaarWeight = 0;
        } else {
            marketWeight = 0;
            bazaarWeight = 1;
        }

        const realMarketValue =
            this.calculateCombinedValue({
                marketValue,
                bazaarValue,
                marketWeight,
                bazaarWeight
            });

        if (
            !Number.isFinite(realMarketValue) ||
            realMarketValue <= 0
        ) {
            return null;
        }

        const marketVsBazaarDifference =
            this.calculateRelativeDifference(
                marketValue,
                bazaarValue
            );

        const confidence =
            this.calculateCombinedConfidence({
                market,
                bazaars,
                marketWeight,
                bazaarWeight,
                marketQuality,
                bazaarQuality,
                marketVsBazaarDifference
            });

        const highDisagreement =
            Number.isFinite(
                marketVsBazaarDifference
            ) &&
            marketVsBazaarDifference >= 0.30;

        return {
            realMarketValue,
            marketWeight,
            bazaarWeight,
            confidence,
            signals: {
                marketValue,
                bazaarValue,
                marketWeight,
                bazaarWeight,
                marketVsBazaarDifference,
                marketQuality,
                bazaarQuality,
                marketDominant:
                    marketWeight >
                    bazaarWeight,
                bazaarDominant:
                    bazaarWeight >
                    marketWeight,
                highDisagreement,
                lowMarketConfidence:
                    Number(
                        market?.confidence
                    ) < 45,
                lowBazaarConfidence:
                    Number(
                        bazaars?.confidence
                    ) < 45
            }
        };
    }

    extractMarketValue(market) {

        const realMarketValue =
            Number(
                market?.realMarketValue
            );

        return Number.isFinite(realMarketValue) &&
            realMarketValue > 0
            ? realMarketValue
            : null;
    }

    extractBazaarReferenceValue(bazaars) {

        const mean =
            Number(
                bazaars?.weightedMean
            );

        const median =
            Number(
                bazaars?.weightedMedian
            );

        const dispersion =
            Number(
                bazaars?.dispersion
            );

        if (
            !Number.isFinite(mean) &&
            !Number.isFinite(median)
        ) {
            return null;
        }

        if (
            Number.isFinite(mean) &&
            !Number.isFinite(median)
        ) {
            return mean > 0
                ? mean
                : null;
        }

        if (
            Number.isFinite(median) &&
            !Number.isFinite(mean)
        ) {
            return median > 0
                ? median
                : null;
        }

        if (
            mean <= 0 ||
            median <= 0
        ) {
            return null;
        }

        if (
            Number.isFinite(dispersion) &&
            dispersion <= 0.08
        ) {
            return (mean + median) / 2;
        }

        if (
            Number.isFinite(dispersion) &&
            dispersion <= 0.20
        ) {
            return (
                mean * 0.35 +
                median * 0.65
            );
        }

        return median;
    }

    calculateMarketQuality(market) {

        const confidenceFactor =
            this.normalizePercent(
                market?.confidence
            );

        const sampleQuantityFactor =
            this.normalizeByThreshold(
                market?.sampleQuantity,
                250
            );

        const sampleListingsFactor =
            this.normalizeByThreshold(
                market?.sampleListingsCount,
                20
            );

        const dispersionFactor =
            this.inverseDispersionFactor(
                market?.dispersion
            );

        return this.clamp01(
            confidenceFactor * 0.45 +
            sampleQuantityFactor * 0.20 +
            sampleListingsFactor * 0.20 +
            dispersionFactor * 0.15
        );
    }

    calculateBazaarQuality(bazaars) {

        const confidenceFactor =
            this.normalizePercent(
                bazaars?.confidence
            );

        const traderFactor =
            this.normalizeByThreshold(
                bazaars?.traderCount,
                30
            );

        const quantityFactor =
            this.normalizeByThreshold(
                bazaars?.totalQuantity,
                1000
            );

        const dispersionFactor =
            this.inverseDispersionFactor(
                bazaars?.dispersion
            );

        const concentrationFactor =
            this.inverseConcentrationFactor(
                bazaars?.largestTraderShare
            );

        return this.clamp01(
            confidenceFactor * 0.35 +
            traderFactor * 0.20 +
            quantityFactor * 0.15 +
            dispersionFactor * 0.15 +
            concentrationFactor * 0.15
        );
    }

    inverseDispersionFactor(dispersion) {

        const value =
            Number(dispersion);

        if (!Number.isFinite(value)) {
            return 0.5;
        }

        if (value <= 0.05) {
            return 1;
        }

        if (value >= 0.60) {
            return 0;
        }

        return this.clamp01(
            1 - value / 0.60
        );
    }

    inverseConcentrationFactor(share) {

        const value =
            Number(share);

        if (!Number.isFinite(value)) {
            return 0.5;
        }

        return this.clamp01(
            1 - value
        );
    }

    normalizePercent(value) {

        const numeric =
            Number(value);

        if (!Number.isFinite(numeric)) {
            return 0;
        }

        return this.clamp01(
            numeric / 100
        );
    }

    normalizeByThreshold(
        value,
        threshold
    ) {

        const numeric =
            Number(value);

        if (
            !Number.isFinite(numeric) ||
            numeric <= 0
        ) {
            return 0;
        }

        return this.clamp01(
            numeric / threshold
        );
    }

    calculateCombinedValue({
        marketValue,
        bazaarValue,
        marketWeight,
        bazaarWeight
    }) {

        if (
            marketValue !== null &&
            bazaarValue === null
        ) {
            return marketValue;
        }

        if (
            bazaarValue !== null &&
            marketValue === null
        ) {
            return bazaarValue;
        }

        return (
            marketValue * marketWeight +
            bazaarValue * bazaarWeight
        );
    }

    calculateRelativeDifference(
        marketValue,
        bazaarValue
    ) {

        if (
            !Number.isFinite(marketValue) ||
            !Number.isFinite(bazaarValue) ||
            marketValue <= 0 ||
            bazaarValue <= 0
        ) {
            return null;
        }

        return Math.abs(
            marketValue -
            bazaarValue
        ) / Math.max(
            marketValue,
            bazaarValue
        );
    }

    calculateCombinedConfidence({
        market,
        bazaars,
        marketWeight,
        bazaarWeight,
        marketQuality,
        bazaarQuality,
        marketVsBazaarDifference
    }) {

        if (
            marketWeight === 1 &&
            bazaarWeight === 0
        ) {
            return this.clampPercent(
                Number(
                    market?.confidence
                ) || 0
            );
        }

        if (
            marketWeight === 0 &&
            bazaarWeight === 1
        ) {
            return this.clampPercent(
                Number(
                    bazaars?.confidence
                ) || 0
            );
        }

        const confidenceBlend =
            (this.clampPercent(
                Number(
                    market?.confidence
                ) || 0
            ) * marketWeight) +
            (this.clampPercent(
                Number(
                    bazaars?.confidence
                ) || 0
            ) * bazaarWeight);

        const qualityBlend =
            (
                marketQuality *
                marketWeight +
                bazaarQuality *
                bazaarWeight
            ) * 100;

        let disagreementPenalty =
            0;

        if (
            Number.isFinite(
                marketVsBazaarDifference
            )
        ) {
            disagreementPenalty =
                this.clampPercent(
                    (
                        marketVsBazaarDifference / 0.60
                    ) * 35
                );
        }

        return this.clampPercent(
            confidenceBlend * 0.60 +
            qualityBlend * 0.40 -
            disagreementPenalty
        );
    }

    clamp01(value) {

        if (!Number.isFinite(value)) {
            return 0;
        }

        return Math.min(
            1,
            Math.max(
                0,
                value
            )
        );
    }

    clampPercent(value) {

        if (!Number.isFinite(value)) {
            return 0;
        }

        return Math.min(
            100,
            Math.max(
                0,
                Math.round(value)
            )
        );
    }
}
