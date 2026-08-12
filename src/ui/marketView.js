/*
 * =============================================================
 * MARKETVIEW.JS
 * =============================================================
 *
 * Análisis del mercado — detalle de OFERTA y PRECIOS calculados
 * por MarketAnalyzer sobre el Torn Item Market.
 *
 * ┌──────────────────────────────┐
 * │ 📦 OFERTA                    │
 * │ Unidades totales   15,458    │
 * │ Muestra             1,546    │
 * │ Vendedores analizados   30   │
 * │ Muestra efectiva       10%   │
 * ├──────────────────────────────┤
 * │ 💰 PRECIOS                   │
 * │ Promedio ponderado $1,130    │
 * │ Mediana ponderada  $1,199    │
 * │ Mercado estimado   $1,165    │
 * │ Compra calculada      $932   │
 * │ Confianza             95%    │
 * │ Ver distribución          ›  │
 * └──────────────────────────────┘
 *
 * Responsabilidad única: PINTAR audit.market (+ audit.correctBuyPrice).
 *
 * Esta vista NO recalcula nada — todos los números provienen
 * de MarketAnalyzer.analyze(), ya guardados en el audit.
 *
 * =============================================================
 * ⚠ NOTA PARA distributionView.js (próxima vista)
 * =============================================================
 *
 * auditor.js NO persiste `sampleListings` dentro de `audit.market`
 * (MarketAnalyzer sí lo calcula internamente, pero auditor.js no
 * lo copia al resultado final guardado). Por lo tanto, cuando
 * construyamos distributionView.js, la lista "$436 × 1 / $795 × 1..."
 * no tendrá datos reales hasta que se agregue `sampleListings` al
 * objeto `market` en auditor.js. Esta vista no se ve afectada,
 * pero lo dejo anotado aquí porque es la puerta de entrada a esa
 * pantalla.
 * =============================================================
 */

import {
    createScreen,
    createContent,
    createHeader,
    createSectionTitle,
    createDivider,
    createRow,
    createCard,
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
 * @param {Object} deps.item          - artículo de Pricelist
 * @param {Object} deps.audit         - auditoría ya resuelta
 * @param {Function} deps.onNavigate  - (screen, params?, options?) => void
 * @param {Function} deps.onBack
 *
 * @returns {{ node: HTMLElement, destroy: Function }}
 */

export function renderMarketView({
    item,
    audit,
    onNavigate,
    onBack
}) {

    const header =
        createHeader({

            title:
                "Análisis del mercado",

            onBack
        });


    /* =====================================================
     * VALIDACIÓN
     * ===================================================== */

    const market =
        audit?.market ||
        null;


    if (!market) {

        const screen =
            createScreen([

                header,

                createContent([

                    createEmptyState(
                        "No hay datos de mercado disponibles para este artículo."
                    )
                ])
            ]);

        return {
            node: screen,
            destroy() {}
        };
    }


    /* =====================================================
     * OFERTA
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


    const supplySection = [

        createSectionTitle(
            "📦 Oferta"
        ),

        createRow({

            label:
                "Unidades totales",

            value:
                Number.isFinite(totalQuantity)
                    ? formatCompactNumber(totalQuantity)
                    : "—"
        }),

        createRow({

            label:
                "Muestra",

            value:
                Number.isFinite(targetQuantity)
                    ? formatCompactNumber(targetQuantity)
                    : "—"
        }),

        createRow({

            label:
                "Vendedores analizados",

            value:
                Number.isFinite(requiredListings)
                    ? formatCompactNumber(requiredListings)
                    : "—"
        }),

        createRow({

            label:
                "Muestra efectiva",

            value:
                Number.isFinite(effectiveSamplePercent)
                    ? formatPercent(effectiveSamplePercent)
                    : "—"
        })
    ];


    /* =====================================================
     * PRECIOS
     * ===================================================== */

    const weightedMean =
        Number(
            market.weightedMean
        );

    const weightedMedian =
        Number(
            market.weightedMedian
        );

    const realMarketValue =
        Number(
            market.realMarketValue
        );

    const correctBuyPrice =
        Number(
            audit.correctBuyPrice
        );

    const confidence =
        Number(
            market.confidence
        );


    const pricesSection = [

        createSectionTitle(
            "💰 Precios"
        ),

        createRow({

            label:
                "Promedio ponderado",

            value:
                Number.isFinite(weightedMean)
                    ? formatMoney(weightedMean)
                    : "—"
        }),

        createRow({

            label:
                "Mediana ponderada",

            value:
                Number.isFinite(weightedMedian)
                    ? formatMoney(weightedMedian)
                    : "—"
        }),

        createRow({

            label:
                "Mercado estimado",

            value:
                Number.isFinite(realMarketValue)
                    ? formatMoney(realMarketValue)
                    : "—",

            emphasis:
                true
        }),

        createRow({

            label:
                "Compra calculada",

            value:
                Number.isFinite(correctBuyPrice)
                    ? formatMoney(correctBuyPrice)
                    : "—"
        }),

        createRow({

            label:
                "Confianza",

            value:
                Number.isFinite(confidence)
                    ? `${Math.round(confidence)}%`
                    : "—"
        })
    ];


    /* =====================================================
     * VER DISTRIBUCIÓN
     * ===================================================== */

    const distributionCard =
        createCard({

            icon:
                "📊",

            label:
                "Ver distribución",

            onClick: () => {

                if (
                    typeof onNavigate ===
                    "function"
                ) {

                    onNavigate(
                        "distribution",
                        { item, audit }
                    );
                }
            }
        });


    /* =====================================================
     * ESTRUCTURA FINAL
     * ===================================================== */

    const screen =
        createScreen([

            header,

            createContent([

                ...supplySection,

                createDivider(),

                ...pricesSection,

                distributionCard
            ])
        ]);


    return {

        node:
            screen,

        destroy() {}
    };
}