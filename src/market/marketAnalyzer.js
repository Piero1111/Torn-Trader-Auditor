import {
    weightedMean,
    weightedMedian,
    calculateDispersion
} from "./statistics.js";

export class MarketAnalyzer {

    constructor(samplePercentage = 0.10) {

        this.samplePercentage =
            Number.isFinite(Number(samplePercentage)) &&
            Number(samplePercentage) > 0 &&
            Number(samplePercentage) <= 1
                ? Number(samplePercentage)
                : 0.10;
    }


    analyze(rawListings) {

        /*
         * =====================================================
         * VALIDAR LISTINGS
         * =====================================================
         */

        if (!Array.isArray(rawListings)) {
            return null;
        }


        const listings =
            rawListings

                .map(listing => {

                    const price =
                        Number(listing?.price);

                    const amount =
                        Number(listing?.amount);

                    if (
                        !Number.isFinite(price) ||
                        !Number.isFinite(amount) ||
                        price <= 0 ||
                        amount <= 0
                    ) {
                        return null;
                    }

                    return {
                        price,
                        amount
                    };
                })

                .filter(Boolean)

                .sort(
                    (a, b) =>
                        a.price - b.price
                );


        if (listings.length === 0) {
            return null;
        }


        /*
         * =====================================================
         * CANTIDAD TOTAL DEL MERCADO
         * =====================================================
         */

        const totalQuantity =
            listings.reduce(
                (sum, listing) =>
                    sum + listing.amount,
                0
            );


        if (
            !Number.isFinite(totalQuantity) ||
            totalQuantity <= 0
        ) {
            return null;
        }


        /*
         * =====================================================
         * TAMAÑO DE MUESTRA
         * =====================================================
         *
         * Tomamos el 10% de las unidades disponibles,
         * comenzando desde las publicaciones más baratas.
         *
         * Ejemplo:
         *
         * Mercado = 10,000 unidades
         *
         * 10% = 1,000 unidades
         *
         * Analizamos las primeras 1,000 unidades.
         */

        const sampleTarget =
            totalQuantity *
            this.samplePercentage;


        const targetQuantity =
            Math.max(
                1,
                Math.ceil(sampleTarget)
            );


        const sample = [];

        let remaining =
            targetQuantity;


        for (
            const listing
            of listings
        ) {

            if (
                remaining <= 0
            ) {
                break;
            }


            const quantity =
                Math.min(
                    listing.amount,
                    remaining
                );


            if (
                quantity <= 0
            ) {
                continue;
            }


            sample.push({
                price:
                    listing.price,

                amount:
                    quantity
            });


            remaining -=
                quantity;
        }


        /*
         * Cantidad realmente utilizada.
         *
         * Normalmente será igual al target,
         * pero no debemos asumirlo.
         */

        const sampleQuantity =
            sample.reduce(
                (sum, listing) =>
                    sum + listing.amount,
                0
            );


        if (
            sample.length === 0 ||
            sampleQuantity <= 0
        ) {
            return null;
        }


        /*
         * =====================================================
         * ESTADÍSTICAS
         * =====================================================
         */

        const mean =
            weightedMean(
                sample
            );


        const median =
            weightedMedian(
                sample
            );


        if (
            !Number.isFinite(mean) ||
            !Number.isFinite(median)
        ) {
            return null;
        }


        /*
         * =====================================================
         * DISPERSIÓN
         * =====================================================
         */

        const dispersion =
            calculateDispersion(
                mean,
                median
            );


        /*
         * =====================================================
         * REAL MARKET VALUE
         * =====================================================
         *
         * Cuando media y mediana están cerca:
         *
         *     Real Market Value =
         *     (Mean + Median) / 2
         *
         * Cuando existe mucha diferencia:
         *
         *     Real Market Value = Median
         *
         * Esto evita que precios extremos
         * distorsionen demasiado el resultado.
         */

        let realMarketValue;


        if (
            dispersion !== null &&
            dispersion <= 0.15
        ) {

            realMarketValue =
                (mean + median) / 2;

        } else {

            realMarketValue =
                median;
        }


        if (
            !Number.isFinite(realMarketValue) ||
            realMarketValue <= 0
        ) {
            return null;
        }


        /*
         * =====================================================
         * CONFIANZA
         * =====================================================
         */

        const confidence =
            this.calculateConfidence({

                totalQuantity,

                sampleQuantity,

                listingsCount:
                    listings.length,

                dispersion
            });


        return {

            totalQuantity,

            sampleQuantity,

            weightedMean:
                mean,

            weightedMedian:
                median,

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

        let score = 0;


        /*
         * =====================================================
         * CANTIDAD TOTAL
         * =====================================================
         */

        if (
            totalQuantity >= 10000
        ) {

            score += 40;

        } else if (
            totalQuantity >= 1000
        ) {

            score += 30;

        } else if (
            totalQuantity >= 100
        ) {

            score += 20;

        } else if (
            totalQuantity >= 20
        ) {

            score += 10;
        }


        /*
         * =====================================================
         * TAMAÑO DE MUESTRA
         * =====================================================
         */

        if (
            sampleQuantity >= 1000
        ) {

            score += 30;

        } else if (
            sampleQuantity >= 100
        ) {

            score += 25;

        } else if (
            sampleQuantity >= 20
        ) {

            score += 15;

        } else if (
            sampleQuantity >= 5
        ) {

            score += 8;
        }


        /*
         * =====================================================
         * NÚMERO DE PUBLICACIONES
         * =====================================================
         */

        if (
            listingsCount >= 50
        ) {

            score += 15;

        } else if (
            listingsCount >= 20
        ) {

            score += 10;

        } else if (
            listingsCount >= 5
        ) {

            score += 5;
        }


        /*
         * =====================================================
         * DISPERSIÓN
         * =====================================================
         */

        if (
            Number.isFinite(dispersion)
        ) {

            if (
                dispersion <= 0.05
            ) {

                score += 15;

            } else if (
                dispersion <= 0.10
            ) {

                score += 10;

            } else if (
                dispersion <= 0.20
            ) {

                score += 5;
            }
        }


        return Math.min(
            100,
            Math.max(0, score)
        );
    }
}