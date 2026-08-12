import {
    weightedMean,
    weightedMedian,
    calculateDispersion,
    filterPriceOutliers
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

        if (!Array.isArray(rawListings)) {
            return null;
        }


        let listings =
            rawListings

                .map((listing, index) => {

                    const price =
                        Number(listing?.price);


                    const quantity =
                        Number(listing?.quantity);


                    if (
                        !Number.isFinite(price) ||
                        !Number.isFinite(quantity) ||
                        price <= 0 ||
                        quantity <= 0
                    ) {

                        return null;
                    }


                    return {

                        ...listing,

                        price,

                        quantity,

                        originalIndex:
                            index
                    };
                })


                .filter(Boolean);


        if (
            listings.length === 0
        ) {

            return null;
        }


        /*
         * =====================================================
         * FILTRAR OUTLIERS
         * =====================================================
         *
         * Protección adicional: aunque el muestreo por precio
         * más bajo ya reduce el impacto de listados troleados
         * (quedan al final, fuera de la muestra), un listado
         * con precio anormalmente BAJO (ej. error de tecleo)
         * sí podría colarse en la muestra "más barata" y
         * arrastrar el resultado hacia abajo. Ver
         * statistics.js → filterPriceOutliers().
         */

        listings =
            filterPriceOutliers(
                listings
            );


        listings =
            listings.sort(
                (a, b) =>
                    a.price - b.price
            );


        const totalQuantity =
            listings.reduce(
                (sum, listing) =>
                    sum + listing.quantity,
                0
            );


        if (
            !Number.isFinite(totalQuantity) ||
            totalQuantity <= 0
        ) {

            return null;
        }


        const targetQuantity =
            totalQuantity * 0.10;


        let accumulatedQuantity =
            0;

        let requiredListings =
            0;


        for (
            const listing
            of listings
        ) {

            accumulatedQuantity +=
                listing.quantity;

            requiredListings += 1;

            if (
                accumulatedQuantity >=
                targetQuantity
            ) {

                break;
            }
        }


        if (
            requiredListings <= 0
        ) {

            return null;
        }


        const sampleListingsCount =
            requiredListings;


        const sellerSampleSize =
            Math.min(
                listings.length,
                Math.max(
                    Math.ceil(
                        sampleListingsCount *
                        0.10
                    ),
                    5
                )
            );


        const selectedListings =
            listings.slice(
                0,
                sellerSampleSize
            );


        if (
            selectedListings.length === 0
        ) {

            return null;
        }


        const sampleQuantity =
            selectedListings.reduce(
                (sum, listing) =>
                    sum + listing.quantity,
                0
            );


        if (
            !Number.isFinite(sampleQuantity) ||
            sampleQuantity <= 0
        ) {

            return null;
        }


        const statisticalSample =
            selectedListings.map(
                listing => ({

                    price:
                        listing.price,

                    amount:
                        listing.quantity
                })
            );


        const mean =
            weightedMean(
                statisticalSample
            );


        const median =
            weightedMedian(
                statisticalSample
            );


        if (
            !Number.isFinite(mean) ||
            !Number.isFinite(median)
        ) {

            return null;
        }


        const dispersion =
            calculateDispersion(
                mean,
                median
            );


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


        const confidence =
            this.calculateConfidence({

                totalQuantity,

                sampleQuantity,

                listingsCount:
                    listings.length,

                sampleListingsCount,

                sellerSampleSize,

                dispersion
            });


        return {

            totalQuantity,

            listingsCount:
                listings.length,

            targetQuantity,

            requiredListings:
                sampleListingsCount,

            accumulatedQuantity,

            sampleListingsCount,

            sellerSampleSize,

            sampleSize:
                sellerSampleSize,

            sampleQuantity,

            weightedMean:
                mean,

            weightedMedian:
                median,

            dispersion,

            realMarketValue,

            confidence,

            sampleListings:
                selectedListings.map(
                    listing => ({

                        uid:
                            listing.uid ?? null,

                        playerId:
                            listing.player_id ??
                            null,

                        playerName:
                            listing.player_name ??
                            null,

                        price:
                            listing.price,

                        quantity:
                            listing.quantity,

                        contentUpdated:
                            listing.content_updated ??
                            null,

                        lastChecked:
                            listing.last_checked ??
                            null
                    })
                )
        };
    }


    calculateConfidence({

        totalQuantity,

        sampleQuantity,

        listingsCount,

        sampleListingsCount,

        sellerSampleSize,

        dispersion

    }) {

        let score = 0;


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


        if (
            sellerSampleSize >= 10
        ) {

            score += 10;

        } else if (
            sellerSampleSize >= 5
        ) {

            score += 7;

        } else if (
            sellerSampleSize >= 3
        ) {

            score += 5;

        } else if (
            sellerSampleSize >= 2
        ) {

            score += 3;
        }


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


        if (
            sampleListingsCount <= 1
        ) {

            score *= 0.65;

        } else if (
            sampleListingsCount <= 2
        ) {

            score *= 0.80;
        }


        return Math.min(
            100,
            Math.max(
                0,
                Math.round(score)
            )
        );
    }
}