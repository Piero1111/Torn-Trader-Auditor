export function weightedMean(listings) {

    let totalQuantity = 0;
    let weightedTotal = 0;

    for (const listing of listings) {

        if (
            !Number.isFinite(listing.price) ||
            !Number.isFinite(listing.amount) ||
            listing.price <= 0 ||
            listing.amount <= 0
        ) {
            continue;
        }

        totalQuantity += listing.amount;
        weightedTotal += listing.price * listing.amount;
    }

    if (totalQuantity === 0) {
        return null;
    }

    return weightedTotal / totalQuantity;
}


export function weightedMedian(listings) {

    const valid = listings
        .filter(l =>
            Number.isFinite(l.price) &&
            Number.isFinite(l.amount) &&
            l.price > 0 &&
            l.amount > 0
        )
        .sort((a, b) => a.price - b.price);

    if (valid.length === 0) {
        return null;
    }

    let totalQuantity = 0;

    for (const listing of valid) {
        totalQuantity += listing.amount;
    }

    const target = totalQuantity / 2;

    let accumulated = 0;

    for (const listing of valid) {

        accumulated += listing.amount;

        if (accumulated >= target) {
            return listing.price;
        }
    }

    return valid[valid.length - 1].price;
}


export function calculateDispersion(mean, median) {

    if (
        !Number.isFinite(mean) ||
        !Number.isFinite(median) ||
        median === 0
    ) {
        return null;
    }

    return Math.abs(mean - median) / median;
}


/*
 * =============================================================
 * FILTRO DE OUTLIERS DE PRECIO
 * =============================================================
 *
 * Torn permite (y es común) que traders pongan precios
 * absurdos en bazares/mercado: trolleo, listados "de reserva",
 * errores de tecleo con ceros de más. Como los promedios están
 * ponderados por cantidad, UN SOLO listado disparatado puede
 * arrastrar weightedMean a cifras sin sentido (ej: un ítem de
 * $8,929 mostrando un "Mercado real" de $960,851).
 *
 * Estrategia:
 *
 *   1. Calculamos una mediana "cruda" (no ponderada) de los
 *      precios, como ancla robusta (la mediana no se deja
 *      arrastrar por un solo outlier, a diferencia del
 *      promedio).
 *
 *   2. Descartamos listados cuyo precio esté a más de
 *      `multiplier` veces por encima o por debajo de esa
 *      mediana.
 *
 *   3. Si el filtro eliminara TODA la muestra (mercado
 *      genuinamente caótico), preferimos conservar el
 *      conjunto original antes que quedarnos sin datos:
 *      es responsabilidad de la capa de confianza penalizar
 *      esa dispersión, no de este filtro borrar todo.
 *
 * @param {Array<{price:number, amount?:number, quantity?:number}>} listings
 * @param {Object} [options]
 * @param {number} [options.multiplier=6]
 * @param {number} [options.minSampleSize=3] - por debajo de este
 *        tamaño no filtramos (poca muestra ya es poco confiable
 *        por sí sola; no tiene sentido además recortarla).
 */

export function filterPriceOutliers(
    listings,
    {
        multiplier = 6,
        minSampleSize = 3
    } = {}
) {

    if (
        !Array.isArray(listings) ||
        listings.length < minSampleSize
    ) {

        return listings;
    }


    const prices =
        listings
            .map(listing => Number(listing.price))
            .filter(price =>
                Number.isFinite(price) &&
                price > 0
            )
            .sort((a, b) => a - b);


    if (prices.length < minSampleSize) {

        return listings;
    }


    const mid =
        Math.floor(prices.length / 2);

    const median =
        prices.length % 2 === 0
            ? (prices[mid - 1] + prices[mid]) / 2
            : prices[mid];


    if (
        !Number.isFinite(median) ||
        median <= 0
    ) {

        return listings;
    }


    const upperBound =
        median * multiplier;

    const lowerBound =
        median / multiplier;


    const filtered =
        listings.filter(listing => {

            const price =
                Number(listing.price);

            return (
                Number.isFinite(price) &&
                price >= lowerBound &&
                price <= upperBound
            );
        });


    if (filtered.length === 0) {

        return listings;
    }


    return filtered;
}