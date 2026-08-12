/*
 * =============================================================
 * DISTRIBUTIONVIEW.JS
 * =============================================================
 *
 * Distribución de vendedores — detalle de qué vendedores
 * concretos formaron la muestra estadística usada por
 * MarketAnalyzer, y cuántos quedaron fuera.
 *
 * ┌──────────────────────────────┐
 * │ Mercado: 1,000 unidades      │
 * │ Muestra objetivo: 100        │
 * │ Vendedores encontrados: 30   │
 * ├──────────────────────────────┤
 * │ Muestra final: 10%           │
 * │ Incluidos             3      │
 * │ Excluidos            27      │
 * ├──────────────────────────────┤
 * │ $436 × 1                     │
 * │ $795 × 1                     │
 * │ $800 × 2                     │
 * │ ...                          │
 * └──────────────────────────────┘
 *
 * Sirve especialmente para auditar al propio algoritmo:
 * el usuario puede ver EXACTAMENTE qué vendedores entraron
 * en el cálculo del "Mercado estimado".
 *
 * Responsabilidad única: PINTAR audit.market.sampleListings.
 * No recalcula nada.
 *
 * Requiere que auditor.js persista `market.sampleListings`
 * (ver nota en marketView.js / cambio aplicado en auditor.js).
 * =============================================================
 */

import {
    el,
    createScreen,
    createContent,
    createHeader,
    createSectionTitle,
    createDivider,
    createRow,
    createEmptyState,
    formatMoney,
    formatPercent,
    formatCompactNumber
} from "./styles.js";


/* =============================================================
 * RENDER
 * =============================================================
 *
 * @param {Object} deps
 * @param {Object} deps.audit   - auditoría ya resuelta
 * @param {Function} deps.onBack
 *
 * @returns {{ node: HTMLElement, destroy: Function }}
 */

export function renderDistributionView({
    audit,
    onBack
}) {

    const header =
        createHeader({

            title:
                "Distribución",

            onBack
        });


    /* =====================================================
     * VALIDACIÓN
     * ===================================================== */

    const market =
        audit?.market ||
        null;


    const sampleListings =
        Array.isArray(market?.sampleListings)
            ? market.sampleListings
            : [];


    if (
        !market ||
        sampleListings.length === 0
    ) {

        const screen =
            createScreen([

                header,

                createContent([

                    createEmptyState(
                        "No hay datos de distribución disponibles para este artículo."
                    )
                ])
            ]);

        return {
            node: screen,
            destroy() {}
        };
    }


    /* =====================================================
     * RESUMEN DEL MERCADO
     * ===================================================== */

    const totalQuantity =
        Number(
            market.totalQuantity
        );

    const targetQuantity =
        Number(
            market.targetQuantity
        );

    const requiredListings =
        Number(
            market.requiredListings
        );

    const sampleSize =
        Number(
            market.sampleSize
        );


    const summarySection = [

        createRow({

            label:
                "Mercado",

            value:
                Number.isFinite(totalQuantity)
                    ? `${formatCompactNumber(totalQuantity)} unidades`
                    : "—"
        }),

        createRow({

            label:
                "Muestra objetivo",

            value:
                Number.isFinite(targetQuantity)
                    ? formatCompactNumber(targetQuantity)
                    : "—"
        }),

        createRow({

            label:
                "Vendedores encontrados",

            value:
                Number.isFinite(requiredListings)
                    ? formatCompactNumber(requiredListings)
                    : "—"
        })
    ];


    /* =====================================================
     * MUESTRA FINAL
     * ===================================================== */

    let effectiveSamplePercent =
        null;

    if (
        Number.isFinite(sampleSize) &&
        Number.isFinite(requiredListings) &&
        requiredListings > 0
    ) {

        effectiveSamplePercent =
            sampleSize /
            requiredListings;
    }


    const included =
        Number.isFinite(sampleSize)
            ? sampleSize
            : sampleListings.length;

    const excluded =
        Number.isFinite(requiredListings)
            ? Math.max(
                0,
                requiredListings - included
            )
            : null;


    const sampleSection = [

        createRow({

            label:
                "Muestra final",

            value:
                Number.isFinite(effectiveSamplePercent)
                    ? formatPercent(effectiveSamplePercent)
                    : "—"
        }),

        createRow({

            label:
                "Incluidos",

            value:
                String(included)
        }),

        createRow({

            label:
                "Excluidos",

            value:
                excluded !== null
                    ? String(excluded)
                    : "—"
        })
    ];


    /* =====================================================
     * LISTA AGRUPADA POR PRECIO
     * =====================================================
     *
     * Ejemplo:
     *
     *     $436 × 1
     *     $795 × 1
     *     $800 × 2
     *
     * Se agrupan los listings incluidos por precio exacto,
     * sumando la cantidad total en cada nivel de precio.
     * Se ordena de menor a mayor precio (igual que hace
     * MarketAnalyzer al procesar el mercado).
     */

    const groupedByPrice =
        groupListingsByPrice(
            sampleListings
        );


    const distributionRows =
        groupedByPrice.map(
            group =>
                el("div", {

                    className:
                        "tw3b-dist-row tw3b-dist-included",

                    text:
                        `${formatMoney(group.price)} × ${group.quantity}`
                })
        );


    /* =====================================================
     * ESTRUCTURA FINAL
     * ===================================================== */

    const screen =
        createScreen([

            header,

            createContent([

                ...summarySection,

                createDivider(),

                ...sampleSection,

                createDivider(),

                ...distributionRows
            ])
        ]);


    return {

        node:
            screen,

        destroy() {}
    };
}


/* =============================================================
 * AGRUPAR LISTINGS POR PRECIO
 * =============================================================
 *
 * @param {Array} listings - array de { price, quantity, ... }
 * @returns {Array<{ price: number, quantity: number }>}
 *          ordenado ascendente por precio
 */

function groupListingsByPrice(listings) {

    const groups =
        new Map();


    for (const listing of listings) {

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

            continue;
        }


        const existing =
            groups.get(price) ||
            0;


        groups.set(
            price,
            existing + quantity
        );
    }


    return Array.from(groups.entries())

        .map(([price, quantity]) => ({
            price,
            quantity
        }))

        .sort(
            (a, b) =>
                a.price - b.price
        );
}