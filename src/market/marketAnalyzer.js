import {
    weightedMean,
    weightedMedian,
    calculateDispersion
} from "./statistics.js";

export class MarketAnalyzer {

    constructor(samplePercentage = 0.10) {
        this.samplePercentage = samplePercentage;
    }

    analyze(rawListings) {

        const listings = rawListings
            .filter(listing =>
                Number.isFinite(listing.price) &&
                Number.isFinite(listing.amount) &&
                listing.price > 0 &&
                listing.amount > 0
            )
            .map(listing => ({
                price: Number(listing.price),
                amount: Number(listing.amount)
            }))
            .sort((a, b) => a.price - b.price);

        if (listings.length === 0) {
            return null;
        }

        const totalQuantity = listings.reduce(
            (sum, listing) => sum + listing.amount,
            0
        );

        const sampleTarget = totalQuantity * this.samplePercentage;

        /*
         * En mercados pequeños nunca debemos terminar
         * con una muestra de 0 unidades.
         */
        const targetQuantity = Math.max(
            1,
            Math.ceil(sampleTarget)
        );

        const sample = [];

        let remaining = targetQuantity;

        for (const listing of listings) {

            if (remaining <= 0) {
                break;
            }

            const quantity = Math.min(
                listing.amount,
                remaining
            );

            sample.push({
                price: listing.price,
                amount: quantity
            });

            remaining -= quantity;
        }

        const mean = weightedMean(sample);
        const median = weightedMedian(sample);

        let realMarketValue;

        if (mean === null || median === null) {
            return null;
        }

        const dispersion = calculateDispersion(
            mean,
            median
        );

        /*
         * Si media y mediana están cerca,
         * utilizamos ambas.
         *
         * Si existe una gran diferencia,
         * confiamos principalmente en la mediana.
         */
        if (dispersion !== null && dispersion <= 0.15) {
            realMarketValue = (mean + median) / 2;
        } else {
            realMarketValue = median;
        }

        const confidence = this.calculateConfidence({
            totalQuantity,
            sampleQuantity: targetQuantity,
            listingsCount: listings.length,
            dispersion
        });

        return {
            totalQuantity,
            sampleQuantity: targetQuantity,

            weightedMean: mean,
            weightedMedian: median,

            dispersion,

            realMarketValue,

            confidence
        };
    }


    calculateConfidence({
        totalQuantity,
        sampleQuantity,
        listingsCount,
        dispersion
    }) {

        /*
         * Estas ponderaciones son iniciales.
         * Deben poder ajustarse después de observar
         * resultados reales del mercado.
         */

        let score = 0;

        // Cantidad de datos
        if (totalQuantity >= 10000) {
            score += 40;
        } else if (totalQuantity >= 1000) {
            score += 30;
        } else if (totalQuantity >= 100) {
            score += 20;
        } else if (totalQuantity >= 20) {
            score += 10;
        }

        // Tamaño de muestra
        if (sampleQuantity >= 1000) {
            score += 30;
        } else if (sampleQuantity >= 100) {
            score += 25;
        } else if (sampleQuantity >= 20) {
            score += 15;
        } else if (sampleQuantity >= 5) {
            score += 8;
        }

        // Número de publicaciones
        if (listingsCount >= 50) {
            score += 15;
        } else if (listingsCount >= 20) {
            score += 10;
        } else if (listingsCount >= 5) {
            score += 5;
        }

        // Dispersión
        if (dispersion !== null) {

            if (dispersion <= 0.05) {
                score += 15;
            } else if (dispersion <= 0.10) {
                score += 10;
            } else if (dispersion <= 0.20) {
                score += 5;
            }
        }

        return Math.min(100, score);
    }
}