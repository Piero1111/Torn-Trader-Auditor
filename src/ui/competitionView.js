/*
 * =============================================================
 * COMPETITIONVIEW.JS
 * =============================================================
 *
 * Competencia — resumen de bazares (BazaarAnalyzer) y ranking
 * de vendedores por volumen.
 *
 * ┌──────────────────────────────┐
 * │ 🏪 BAZARES                   │
 * │ Precio promedio     $428     │
 * │ Precio volumen      $600     │
 * ├──────────────────────────────┤
 * │ MAYOR VOLUMEN                │
 * │ ElPokerr          $800 ×83   │
 * │ Barbados          $750 ×69   │
 * │ ...                          │
 * │ Ver todos ›                  │
 * └──────────────────────────────┘
 *
 * Responsabilidad única: PINTAR audit.bazaars.
 * No recalcula nada.
 *
 * Requiere que auditor.js persista `bazaars.topTraders`
 * (ver cambio en bazaarAnalyzer.js / auditor.js).
 *
 * "Ver todos" no navega a una pantalla nueva (no existe en la
 * arquitectura del proyecto): expande la lista in-place.
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
    formatCompactNumber
} from "./styles.js";


const TOP_TRADERS_PREVIEW_COUNT =
    6;


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

export function renderCompetitionView({
    audit,
    onBack
}) {

    const header =
        createHeader({

            title:
                "Competencia",

            onBack
        });


    /* =====================================================
     * VALIDACIÓN
     * ===================================================== */

    const bazaars =
        audit?.bazaars ||
        null;


    if (!bazaars) {

        const screen =
            createScreen([

                header,

                createContent([

                    createEmptyState(
                        "No hay datos de bazares disponibles para este artículo."
                    )
                ])
            ]);

        return {
            node: screen,
            destroy() {}
        };
    }


    /* =====================================================
     * RESUMEN DE BAZARES
     * ===================================================== */

    const weightedMean =
        Number(
            bazaars.weightedMean
        );

    const weightedMedian =
        Number(
            bazaars.weightedMedian
        );


    const summarySection = [

        createSectionTitle(
            "🏪 Bazares"
        ),

        createRow({

            label:
                "Precio promedio",

            value:
                Number.isFinite(weightedMean)
                    ? formatMoney(weightedMean)
                    : "—"
        }),

        createRow({

            label:
                "Precio volumen",

            value:
                Number.isFinite(weightedMedian)
                    ? formatMoney(weightedMedian)
                    : "—"
        })
    ];


    /* =====================================================
     * MAYOR VOLUMEN (RANKING)
     * ===================================================== */

    const topTraders =
        Array.isArray(bazaars.topTraders)
            ? bazaars.topTraders
            : [];


    const rankingTitle =
        createSectionTitle(
            "Mayor volumen"
        );


    const rankingContainer =
        el("div", {

            style: {
                display: "flex",
                flexDirection: "column"
            }
        });


    let expanded =
        false;


    const seeAllButton =
        el("div", {

            className:
                "tw3b-card",

            attrs: {
                role: "button"
            },

            style: {
                justifyContent:
                    "center",
                marginTop:
                    "6px"
            },

            on: {

                click: () => {

                    expanded =
                        !expanded;

                    renderRanking();
                }
            }

        }, [

            el("span", {

                className:
                    "tw3b-card-label",

                style: {
                    textAlign:
                        "center"
                },

                text:
                    expanded
                        ? "Ver menos"
                        : "Ver todos"
            })
        ]);


    function renderRanking() {

        rankingContainer.innerHTML =
            "";

        if (topTraders.length === 0) {

            rankingContainer.appendChild(

                createEmptyState(
                    "No hay vendedores registrados en bazares."
                )
            );

            seeAllButton.style.display =
                "none";

            return;
        }

        const visibleTraders =
            expanded
                ? topTraders
                : topTraders.slice(
                    0,
                    TOP_TRADERS_PREVIEW_COUNT
                );

        for (const trader of visibleTraders) {

            rankingContainer.appendChild(

                createTraderRow(trader)
            );
        }

        seeAllButton.style.display =
            topTraders.length > TOP_TRADERS_PREVIEW_COUNT
                ? "flex"
                : "none";

        seeAllButton.querySelector(
            ".tw3b-card-label"
        ).textContent =
            expanded
                ? "Ver menos"
                : "Ver todos";
    }


    renderRanking();


    /* =====================================================
     * ESTRUCTURA FINAL
     * ===================================================== */

    const screen =
        createScreen([

            header,

            createContent([

                ...summarySection,

                createDivider(),

                rankingTitle,

                rankingContainer,

                seeAllButton
            ])
        ]);


    return {

        node:
            screen,

        destroy() {}
    };
}


/* =============================================================
 * FILA DE TRADER (nombre + precio × cantidad)
 * ============================================================= */

function createTraderRow(trader) {

    const name =
        trader.playerName ||
        (
            trader.playerId
                ? `Jugador #${trader.playerId}`
                : "Desconocido"
        );

    const price =
        Number(
            trader.averagePrice
        );

    const quantity =
        Number(
            trader.quantity
        );

    return el("div", {

        className:
            "tw3b-row"

    }, [

        el("div", {

            className:
                "tw3b-row-label",

            style: {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "55%"
            },

            text:
                name
        }),

        el("div", {

            className:
                "tw3b-row-value",

            text:
                `${
                    Number.isFinite(price)
                        ? formatMoney(price)
                        : "—"
                } ×${
                    Number.isFinite(quantity)
                        ? formatCompactNumber(quantity)
                        : "—"
                }`
        })
    ]);
}