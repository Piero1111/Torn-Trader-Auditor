import {
    weightedMean,
    weightedMedian,
    calculateDispersion,
    filterPriceOutliers
} from "./statistics.js";

export class BazaarAnalyzer {

    analyze(rawListings) {

        if (!Array.isArray(rawListings)) {
            return null;
        }

        let listings =
            rawListings
                .map((listing, index) => {

                    if (!listing || typeof listing !== "object") {
                        return null;
                    }

                    const price =
                        Number(listing.price);

                    const quantity =
                        Number(listing.quantity);

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

        if (listings.length === 0) {
            return null;
        }

        /*
         * =====================================================
         * FILTRAR OUTLIERS
         * =====================================================
         *
         * Ver statistics.js → filterPriceOutliers() para el
         * detalle. Esto evita que un listado con precio
         * disparatado (trolleo, error de tecleo) arrastre el
         * weightedMean a cifras absurdas.
         */

        listings =
            filterPriceOutliers(
                listings
            );

        const listingsCount =
            listings.length;

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

        const minPrice =
            Math.min(
                ...listings.map(
                    listing => listing.price
                )
            );

        const maxPrice =
            Math.max(
                ...listings.map(
                    listing => listing.price
                )
            );

        const statisticalListings =
            listings.map(
                listing => ({
                    price:
                        listing.price,
                    amount:
                        listing.quantity
                })
            );

        const mean =
            weightedMean(
                statisticalListings
            );

        const median =
            weightedMedian(
                statisticalListings
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

        const priceDistribution =
            this.buildPriceDistribution(
                listings
            );

        const {
            traderCount,
            largestTraderQuantity,
            largestTraderShare,
            topTraders
        } =
            this.calculateTraderConcentration({
                listings,
                totalQuantity
            });

        const confidence =
            this.calculateConfidence({
                totalQuantity,
                listingsCount,
                traderCount,
                dispersion
            });

        return {
            totalQuantity,
            listingsCount,
            traderCount,
            minPrice,
            maxPrice,
            weightedMean:
                mean,
            weightedMedian:
                median,
            dispersion,
            priceDistribution,
            largestTraderQuantity,
            largestTraderShare,
            topTraders,
            confidence
        };
    }

    buildPriceDistribution(listings) {

        const distribution =
            new Map();

        for (const listing of listings) {

            const bucket =
                distribution.get(
                    listing.price
                ) || {
                    price:
                        listing.price,
                    quantity:
                        0,
                    listingsCount:
                        0
                };

            bucket.quantity +=
                listing.quantity;

            bucket.listingsCount += 1;

            distribution.set(
                listing.price,
                bucket
            );
        }

        return Array.from(
            distribution.values()
        ).sort(
            (a, b) =>
                a.price - b.price
        );
    }

    calculateTraderConcentration({
        listings,
        totalQuantity
    }) {

        const traderData =
            new Map();

        for (const listing of listings) {

            const traderKey =
                this.getTraderKey(
                    listing
                );

            if (!traderKey) {
                continue;
            }

            const existing =
                traderData.get(traderKey) || {

                    playerId:
                        Number.isFinite(
                            Number(listing.player_id)
                        )
                            ? Number(listing.player_id)
                            : null,

                    playerName:
                        typeof listing.player_name === "string"
                            ? listing.player_name.trim()
                            : null,

                    quantity:
                        0,

                    weightedPriceTotal:
                        0
                };

            existing.quantity +=
                listing.quantity;

            existing.weightedPriceTotal +=
                listing.price *
                listing.quantity;

            traderData.set(
                traderKey,
                existing
            );
        }

        const traderCount =
            traderData.size;

        let largestTraderQuantity =
            0;

        for (const data of traderData.values()) {
            if (data.quantity > largestTraderQuantity) {
                largestTraderQuantity =
                    data.quantity;
            }
        }

        const largestTraderShare =
            totalQuantity > 0
                ? largestTraderQuantity / totalQuantity
                : 0;

        const topTraders =
            Array.from(traderData.entries())
                .map(([traderKey, data]) => ({

                    traderKey,

                    playerId:
                        data.playerId,

                    playerName:
                        data.playerName,

                    quantity:
                        data.quantity,

                    averagePrice:
                        data.quantity > 0
                            ? data.weightedPriceTotal / data.quantity
                            : null
                }))
                .sort(
                    (a, b) =>
                        b.quantity - a.quantity
                );

        return {
            traderCount,
            largestTraderQuantity,
            largestTraderShare,
            topTraders
        };
    }

    getTraderKey(listing) {

        const playerId =
            Number(listing.player_id);

        if (
            Number.isFinite(playerId) &&
            playerId > 0
        ) {
            return `id:${playerId}`;
        }

        const playerName =
            typeof listing.player_name ===
            "string"
                ? listing.player_name.trim()
                : "";

        if (playerName) {
            return `name:${playerName.toLowerCase()}`;
        }

        return null;
    }

    calculateConfidence({
        totalQuantity,
        listingsCount,
        traderCount,
        dispersion
    }) {

        let score = 0;

        if (totalQuantity >= 10000) {
            score += 30;
        } else if (totalQuantity >= 1000) {
            score += 22;
        } else if (totalQuantity >= 100) {
            score += 15;
        } else if (totalQuantity >= 20) {
            score += 9;
        } else {
            score += 4;
        }

        if (listingsCount >= 100) {
            score += 20;
        } else if (listingsCount >= 30) {
            score += 15;
        } else if (listingsCount >= 10) {
            score += 10;
        } else if (listingsCount >= 3) {
            score += 6;
        } else {
            score += 3;
        }

        if (traderCount >= 50) {
            score += 20;
        } else if (traderCount >= 20) {
            score += 15;
        } else if (traderCount >= 5) {
            score += 10;
        } else if (traderCount >= 2) {
            score += 6;
        } else if (traderCount === 1) {
            score += 3;
        }

        if (Number.isFinite(dispersion)) {
            if (dispersion <= 0.05) {
                score += 30;
            } else if (dispersion <= 0.10) {
                score += 24;
            } else if (dispersion <= 0.20) {
                score += 16;
            } else if (dispersion <= 0.35) {
                score += 10;
            } else {
                score += 5;
            }
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