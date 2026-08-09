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