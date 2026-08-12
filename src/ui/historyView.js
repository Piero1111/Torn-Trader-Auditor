/*
 * =============================================================
 * HISTORYVIEW.JS
 * =============================================================
 *
 * Historial — 3 niveles de navegación:
 *
 *   1. General   → búsqueda + "actualizados recientemente"
 *   2. Producto  → 4 tarjetas de período (día/semana/mes/6m)
 *   3. Período   → gráfico + resumen agregado
 *
 * Jerarquía de datos:
 *
 *   AUDITORÍAS (crudo, ventana corta)
 *       ↓
 *   PRECIO DEL DÍA       → auditHistory (por auditoría)
 *       ↓
 *   PRECIO DE LA SEMANA  → history (1 snapshot/día)
 *       ↓
 *   PRECIO DEL MES       → history (1 snapshot/día)
 *       ↓
 *   PRECIO DE 6 MESES    → history (agregado por mes)
 *
 * "Último día" es el único período que usa datos crudos por
 * auditoría (AuditHistory / storage.getAuditHistory), porque
 * History (historial diario) guarda como máximo 1 snapshot/día
 * y no puede mostrar variación intradía.
 *
 * Todas las funciones de render aquí son ASYNC porque necesitan
 * leer datos (Storage/History) antes de poder pintar. app.js
 * debe hacer `await` al montar estas vistas.
 * =============================================================
 */

import {
    el,
    createScreen,
    createContent,
    createHeader,
    createCard,
    createSectionTitle,
    createDivider,
    createEmptyState,
    formatMoney,
    formatCompactNumber
} from "./styles.js";

import {
    createSearchBar,
    renderSearchResults
} from "./search.js";


/* =============================================================
 * DEFINICIÓN DE PERÍODOS
 * ============================================================= */

export const HISTORY_PERIODS = [

    {
        key: "yesterday",
        label: "Último día",
        icon: "📅"
    },
    {
        key: "last7d",
        label: "Última semana",
        icon: "📅"
    },
    {
        key: "last30d",
        label: "Último mes",
        icon: "📅"
    },
    {
        key: "last6m",
        label: "Últimos 6 meses",
        icon: "📅"
    }
];


const WEEKDAY_LETTERS =
    ["D", "L", "M", "X", "J", "V", "S"];
    // índice = Date.getDay() (0 = domingo)


const MONTH_LABELS = [
    "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
    "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"
];


/* =============================================================
 * 1. HISTORIAL GENERAL
 * =============================================================
 *
 * @param {Object} deps
 * @param {Object} deps.history     - instancia de History
 * @param {Object} deps.pricelist   - instancia de Pricelist
 * @param {Function} deps.onNavigate
 * @param {Function} deps.onBack
 */

export async function renderHistoryGeneralView({
    history,
    pricelist,
    onNavigate,
    onBack
}) {

    let searchBarRef =
        null;


    const header =
        createHeader({

            title:
                "Historial",

            onBack
        });


    const resultsContainer =
        el("div", {

            style: {
                display: "flex",
                flexDirection: "column"
            }
        });


    async function handleSearch(query) {

        resultsContainer.innerHTML =
            "";

        if (!query) {

            renderRecentSection();

            return;
        }

        let matches = [];

        try {

            matches =
                await pricelist.search(
                    query
                );

        } catch (error) {

            console.error(
                "[HistoryView] Error buscando artículos:",
                error
            );

            resultsContainer.appendChild(
                createEmptyState(
                    "Ocurrió un error al buscar."
                )
            );

            return;
        }

        if (
            !Array.isArray(matches) ||
            matches.length === 0
        ) {

            resultsContainer.appendChild(
                createEmptyState(
                    "Sin resultados."
                )
            );

            return;
        }

        resultsContainer.appendChild(

            renderSearchResults({

                items:
                    matches,

                onSelect: (item) => {

                    onNavigate(
                        "historyProduct",
                        { item }
                    );
                }
            })
        );
    }


    searchBarRef =
        createSearchBar({

            placeholder:
                "Buscar artículo...",

            onSearch:
                handleSearch
        });


    /* =====================================================
     * ACTUALIZADOS RECIENTEMENTE
     * ===================================================== */

    const recentSection =
        el("div", {

            style: {
                display: "flex",
                flexDirection: "column"
            }
        });


    function renderRecentSection() {

        resultsContainer.innerHTML =
            "";

        resultsContainer.appendChild(
            recentSection
        );
    }


    let recentEntries =
        [];

    try {

        recentEntries =
            await history.getRecentlyUpdated(
                10
            );

    } catch (error) {

        console.error(
            "[HistoryView] Error obteniendo artículos recientes:",
            error
        );
    }


    recentSection.innerHTML =
        "";

    if (
        !Array.isArray(recentEntries) ||
        recentEntries.length === 0
    ) {

        recentSection.appendChild(

            createEmptyState(
                "Todavía no hay artículos con historial registrado."
            )
        );

    } else {

        recentSection.appendChild(

            createSectionTitle(
                "Actualizados recientemente"
            )
        );

        for (const entry of recentEntries) {

            const item =
                await pricelist.getById(
                    entry.itemId
                );

            if (!item) {
                continue;
            }

            recentSection.appendChild(

                el("div", {

                    className:
                        "tw3b-list-item",

                    attrs: {
                        role: "button"
                    },

                    on: {

                        click: () => {

                            onNavigate(
                                "historyProduct",
                                { item }
                            );
                        }
                    }

                }, [

                    el("div", {

                        className:
                            "tw3b-list-item-name",

                        text:
                            item.name
                    }),

                    el("span", {

                        className:
                            "tw3b-list-item-chevron",

                        text:
                            "›"
                    })
                ])
            );
        }
    }


    renderRecentSection();


    /* =====================================================
     * ESTRUCTURA FINAL
     * ===================================================== */

    const searchWrap =
        el("div", {

            style: {
                padding:
                    "12px 16px",
                background:
                    "#1c1f27",
                borderBottom:
                    "1px solid #2e323d"
            }

        }, [
            searchBarRef.node
        ]);


    const screen =
        createScreen([

            header,

            searchWrap,

            createContent([
                resultsContainer
            ])
        ]);


    return {

        node:
            screen,


        destroy() {

            if (searchBarRef) {

                searchBarRef.destroy();
            }
        }
    };
}


/* =============================================================
 * 2. HISTORIAL DE PRODUCTO (4 tarjetas de período)
 * =============================================================
 *
 * @param {Object} deps
 * @param {Object} deps.item
 * @param {Object} deps.history   - instancia de History
 * @param {Function} deps.onNavigate
 * @param {Function} deps.onBack
 */

export async function renderHistoryProductView({
    item,
    history,
    onNavigate,
    onBack
}) {

    const header =
        createHeader({

            title:
                "Historial",

            onBack
        });


    if (!item) {

        const screen =
            createScreen([

                header,

                createContent([

                    createEmptyState(
                        "No se seleccionó ningún artículo."
                    )
                ])
            ]);

        return {
            node: screen,
            destroy() {}
        };
    }


    let summary =
        null;

    try {

        summary =
            await history.getSummary(
                item.itemId
            );

    } catch (error) {

        console.error(
            "[HistoryView] Error obteniendo resumen de historial:",
            error
        );
    }


    const cards =
        HISTORY_PERIODS.map(period => {

            const aggregate =
                summary?.[period.key] ||
                null;

            const price =
                aggregate &&
                Number.isFinite(
                    Number(aggregate.avgCorrectBuyPrice)
                )
                    ? formatMoney(
                        aggregate.avgCorrectBuyPrice
                    )
                    : "Sin datos";

            return createCard({

                icon:
                    period.icon,

                label:
                    period.label.toUpperCase(),

                value:
                    price,

                onClick: () => {

                    onNavigate(
                        "historyPeriod",
                        {
                            item,
                            period:
                                period.key
                        }
                    );
                }
            });
        });


    const screen =
        createScreen([

            header,

            createContent([

                el("div", {

                    style: {
                        fontSize: "15px",
                        fontWeight: "600",
                        marginBottom: "4px"
                    },

                    text:
                        item.name
                }),

                ...cards
            ])
        ]);


    return {

        node:
            screen,

        destroy() {}
    };
}


/* =============================================================
 * 3. DETALLE DE PERÍODO (gráfico + resumen)
 * =============================================================
 *
 * @param {Object} deps
 * @param {Object} deps.item
 * @param {string} deps.period    - una de HISTORY_PERIODS[].key
 * @param {Object} deps.history       - instancia de History
 * @param {Object} deps.auditHistory  - instancia de AuditHistory
 * @param {Function} deps.onBack
 */

export async function renderHistoryPeriodView({
    item,
    period,
    history,
    auditHistory,
    onBack
}) {

    const periodDef =
        HISTORY_PERIODS.find(
            p => p.key === period
        ) ||
        HISTORY_PERIODS[0];


    const header =
        createHeader({

            title:
                periodDef.label,

            onBack
        });


    if (!item) {

        const screen =
            createScreen([

                header,

                createContent([

                    createEmptyState(
                        "No se seleccionó ningún artículo."
                    )
                ])
            ]);

        return {
            node: screen,
            destroy() {}
        };
    }


    let chartData =
        null;

    try {

        chartData =
            await buildPeriodChartData({

                itemId:
                    item.itemId,

                period,

                history,

                auditHistory
            });

    } catch (error) {

        console.error(
            "[HistoryView] Error construyendo datos del período:",
            error
        );
    }


    if (
        !chartData ||
        chartData.points.length === 0
    ) {

        const screen =
            createScreen([

                header,

                createContent([

                    el("div", {

                        style: {
                            fontSize: "15px",
                            fontWeight: "600"
                        },

                        text:
                            item.name
                    }),

                    createEmptyState(
                        "No hay suficientes datos para este período todavía."
                    )
                ])
            ]);

        return {
            node: screen,
            destroy() {}
        };
    }


    const chartTitle =
        createSectionTitle(
            chartData.chartTitle
        );

    const chartSvg =
        buildLineChart({

            values:
                chartData.points.map(p => p.value),

            labels:
                chartData.points.map(p => p.label)
        });


    const summaryValue =
        Number.isFinite(chartData.averageValue)
            ? formatMoney(chartData.averageValue)
            : "—";


    const screen =
        createScreen([

            header,

            createContent([

                el("div", {

                    style: {
                        fontSize: "15px",
                        fontWeight: "600"
                    },

                    text:
                        item.name
                }),

                chartTitle,

                chartSvg,

                createDivider(),

                el("div", {

                    style: {
                        fontSize: "13px",
                        color: "#9aa0ac",
                        textAlign: "center"
                    },

                    text:
                        chartData.priceLabel
                }),

                el("div", {

                    style: {
                        fontSize: "28px",
                        fontWeight: "700",
                        textAlign: "center",
                        margin: "4px 0 12px 0"
                    },

                    text:
                        summaryValue
                }),

                el("div", {

                    className:
                        "tw3b-row"

                }, [

                    el("div", {

                        className:
                            "tw3b-row-label",

                        text:
                            chartData.countLabel
                    }),

                    el("div", {

                        className:
                            "tw3b-row-value",

                        text:
                            String(
                                chartData.points.length
                            )
                    })
                ])
            ])
        ]);


    return {

        node:
            screen,

        destroy() {}
    };
}


/* =============================================================
 * CONSTRUCCIÓN DE DATOS POR PERÍODO
 * =============================================================
 *
 * Devuelve una estructura uniforme para el renderer del
 * gráfico, sin importar qué período sea:
 *
 * {
 *     points: [{ value, label, timestamp }],
 *     averageValue: number,
 *     chartTitle: string,
 *     priceLabel: string,
 *     countLabel: string
 * }
 */

async function buildPeriodChartData({
    itemId,
    period,
    history,
    auditHistory
}) {

    /* =====================================================
     * ÚLTIMO DÍA → datos crudos por auditoría
     * ===================================================== */

    if (period === "yesterday") {

        const rawEntries =
            auditHistory
                ? await auditHistory.getAll(itemId)
                : [];

        const now =
            Date.now();

        const day =
            24 * 60 * 60 * 1000;

        const dayEntries =
            (Array.isArray(rawEntries) ? rawEntries : [])
                .filter(entry => {

                    const timestamp =
                        Number(entry?.timestamp);

                    if (!Number.isFinite(timestamp)) {
                        return false;
                    }

                    const age =
                        now - timestamp;

                    return age >= 0 && age <= day;
                })
                .sort(
                    (a, b) =>
                        a.timestamp - b.timestamp
                );

        const points =
            dayEntries
                .filter(entry =>
                    Number.isFinite(
                        Number(entry.correctBuyPrice)
                    )
                )
                .map(entry => ({

                    value:
                        Number(entry.correctBuyPrice),

                    label:
                        formatHourLabel(
                            entry.timestamp
                        ),

                    timestamp:
                        entry.timestamp
                }));

        return {

            points,

            averageValue:
                average(
                    points.map(p => p.value)
                ),

            chartTitle:
                "Precio durante el día",

            priceLabel:
                "Precio del día",

            countLabel:
                "Auditorías realizadas"
        };
    }


    /* =====================================================
     * SEMANA / MES → snapshots diarios de History
     * ===================================================== */

    if (
        period === "last7d" ||
        period === "last30d"
    ) {

        const rangeDays =
            period === "last7d"
                ? 7
                : 30;

        const series =
            history
                ? await history.getSeries(itemId)
                : [];

        const now =
            Date.now();

        const dayMs =
            24 * 60 * 60 * 1000;

        const filtered =
            (Array.isArray(series) ? series : [])
                .filter(snapshot => {

                    const timestamp =
                        Number(snapshot?.timestamp);

                    if (!Number.isFinite(timestamp)) {
                        return false;
                    }

                    const age =
                        now - timestamp;

                    return (
                        age >= 0 &&
                        age <= rangeDays * dayMs
                    );
                })
                .sort(
                    (a, b) =>
                        a.timestamp - b.timestamp
                );

        const points =
            filtered
                .filter(snapshot =>
                    Number.isFinite(
                        Number(snapshot.correctBuyPrice)
                    )
                )
                .map(snapshot => ({

                    value:
                        Number(snapshot.correctBuyPrice),

                    label:
                        period === "last7d"
                            ? formatWeekdayLabel(snapshot.timestamp)
                            : formatDayOfMonthLabel(snapshot.timestamp),

                    timestamp:
                        snapshot.timestamp
                }));

        return {

            points,

            averageValue:
                average(
                    points.map(p => p.value)
                ),

            chartTitle:
                "Precio por día",

            priceLabel:
                period === "last7d"
                    ? "Precio de la semana"
                    : "Precio del mes",

            countLabel:
                "Días disponibles"
        };
    }


    /* =====================================================
     * 6 MESES → agregación mensual sobre snapshots diarios
     * ===================================================== */

    if (period === "last6m") {

        const series =
            history
                ? await history.getSeries(itemId)
                : [];

        const now =
            Date.now();

        const dayMs =
            24 * 60 * 60 * 1000;

        const filtered =
            (Array.isArray(series) ? series : [])
                .filter(snapshot => {

                    const timestamp =
                        Number(snapshot?.timestamp);

                    if (!Number.isFinite(timestamp)) {
                        return false;
                    }

                    const age =
                        now - timestamp;

                    return (
                        age >= 0 &&
                        age <= 180 * dayMs
                    );
                });


        const monthBuckets =
            new Map();

        for (const snapshot of filtered) {

            const price =
                Number(snapshot.correctBuyPrice);

            if (!Number.isFinite(price)) {
                continue;
            }

            const date =
                new Date(
                    Number(snapshot.timestamp)
                );

            const monthKey =
                `${date.getFullYear()}-${date.getMonth()}`;

            const bucket =
                monthBuckets.get(monthKey) || {

                    sum: 0,
                    count: 0,
                    timestamp:
                        snapshot.timestamp
                };

            bucket.sum +=
                price;

            bucket.count +=
                1;

            monthBuckets.set(
                monthKey,
                bucket
            );
        }

        const points =
            Array.from(monthBuckets.entries())

                .map(([monthKey, bucket]) => ({

                    value:
                        bucket.sum / bucket.count,

                    label:
                        formatMonthLabel(
                            bucket.timestamp
                        ),

                    timestamp:
                        bucket.timestamp
                }))

                .sort(
                    (a, b) =>
                        a.timestamp - b.timestamp
                );

        return {

            points,

            averageValue:
                average(
                    points.map(p => p.value)
                ),

            chartTitle:
                "Precio por mes",

            priceLabel:
                "Precio 6 meses",

            countLabel:
                "Meses disponibles"
        };
    }


    return {
        points: [],
        averageValue: null,
        chartTitle: "",
        priceLabel: "",
        countLabel: ""
    };
}


/* =============================================================
 * FORMATEADORES DE ETIQUETAS
 * ============================================================= */

function formatHourLabel(timestamp) {

    const date =
        new Date(
            Number(timestamp)
        );

    const hours =
        String(date.getHours())
            .padStart(2, "0");

    return `${hours}h`;
}


function formatWeekdayLabel(timestamp) {

    const date =
        new Date(
            Number(timestamp)
        );

    return WEEKDAY_LETTERS[
        date.getDay()
    ];
}


function formatDayOfMonthLabel(timestamp) {

    const date =
        new Date(
            Number(timestamp)
        );

    return String(
        date.getDate()
    );
}


function formatMonthLabel(timestamp) {

    const date =
        new Date(
            Number(timestamp)
        );

    return MONTH_LABELS[
        date.getMonth()
    ];
}


function average(values) {

    const valid =
        values.filter(
            value =>
                Number.isFinite(value)
        );

    if (valid.length === 0) {
        return null;
    }

    const sum =
        valid.reduce(
            (total, value) =>
                total + value,
            0
        );

    return sum / valid.length;
}


/* =============================================================
 * MINI GRÁFICO DE LÍNEA (SVG nativo, sin dependencias)
 * =============================================================
 *
 * Diseñado para caber en una pantalla de móvil pequeña.
 * Muestra:
 *
 *   - valor máximo / mínimo como etiquetas laterales
 *   - línea poligonal de la serie
 *   - hasta 5 etiquetas en el eje X (evita saturar si hay
 *     muchos puntos, ej. 30 días)
 */

const CHART_WIDTH =
    280;

const CHART_HEIGHT =
    120;

const CHART_PADDING =
    24;


function buildLineChart({
    values,
    labels
}) {

    const validValues =
        values.filter(
            value =>
                Number.isFinite(value)
        );

    if (validValues.length === 0) {

        return createEmptyState(
            "Sin datos suficientes para graficar."
        );
    }


    const minValue =
        Math.min(...validValues);

    const maxValue =
        Math.max(...validValues);

    const range =
        maxValue - minValue || 1;


    const usableWidth =
        CHART_WIDTH - CHART_PADDING * 2;

    const usableHeight =
        CHART_HEIGHT - CHART_PADDING * 2;


    const stepX =
        values.length > 1
            ? usableWidth / (values.length - 1)
            : 0;


    const coords =
        values.map((value, index) => {

            const x =
                CHART_PADDING +
                stepX * index;

            const y =
                CHART_PADDING +
                usableHeight -
                (
                    (value - minValue) /
                    range
                ) * usableHeight;

            return { x, y };
        });


    const pointsAttr =
        coords
            .map(coord => `${coord.x},${coord.y}`)
            .join(" ");


    const svg =
        svgEl("svg", {

            viewBox:
                `0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 20}`,

            width:
                "100%",

            height:
                `${CHART_HEIGHT + 20}`,

            style:
                "display:block;"
        });


    /* -----------------------------------------------------
     * LÍNEA
     * ----------------------------------------------------- */

    svg.appendChild(

        svgEl("polyline", {

            points:
                pointsAttr,

            fill:
                "none",

            stroke:
                "#4dabf7",

            "stroke-width":
                "2",

            "stroke-linejoin":
                "round",

            "stroke-linecap":
                "round"
        })
    );


    /* -----------------------------------------------------
     * PUNTOS
     * ----------------------------------------------------- */

    for (const coord of coords) {

        svg.appendChild(

            svgEl("circle", {

                cx:
                    coord.x,

                cy:
                    coord.y,

                r:
                    "2.5",

                fill:
                    "#4dabf7"
            })
        );
    }


    /* -----------------------------------------------------
     * ETIQUETAS MIN / MAX (eje Y simplificado)
     * ----------------------------------------------------- */

    svg.appendChild(

        svgEl("text", {

            x:
                2,

            y:
                CHART_PADDING,

            fill:
                "#9aa0ac",

            "font-size":
                "9"

        }, formatMoney(maxValue))
    );

    svg.appendChild(

        svgEl("text", {

            x:
                2,

            y:
                CHART_PADDING + usableHeight,

            fill:
                "#9aa0ac",

            "font-size":
                "9"

        }, formatMoney(minValue))
    );


    /* -----------------------------------------------------
     * ETIQUETAS EJE X (máximo 5, distribuidas)
     * ----------------------------------------------------- */

    const labelIndexes =
        pickLabelIndexes(
            labels.length,
            5
        );

    for (const index of labelIndexes) {

        const coord =
            coords[index];

        if (!coord) {
            continue;
        }

        svg.appendChild(

            svgEl("text", {

                x:
                    coord.x,

                y:
                    CHART_HEIGHT + 14,

                fill:
                    "#6b7280",

                "font-size":
                    "9",

                "text-anchor":
                    "middle"

            }, labels[index])
        );
    }


    return svg;
}


/* =============================================================
 * ELEGIR ÍNDICES DE ETIQUETAS A MOSTRAR
 * =============================================================
 *
 * Distribuye hasta `max` etiquetas de forma pareja
 * (incluyendo siempre el primer y último punto).
 */

function pickLabelIndexes(total, max) {

    if (total <= max) {

        return Array.from(
            { length: total },
            (_, i) => i
        );
    }

    const indexes =
        [];

    const step =
        (total - 1) / (max - 1);

    for (let i = 0; i < max; i++) {

        indexes.push(
            Math.round(step * i)
        );
    }

    return Array.from(
        new Set(indexes)
    );
}


/* =============================================================
 * HELPER SVG
 * ============================================================= */

function svgEl(tag, attrs = {}, textContent = null) {

    const node =
        document.createElementNS(
            "http://www.w3.org/2000/svg",
            tag
        );

    for (
        const [key, value]
        of Object.entries(attrs)
    ) {

        node.setAttribute(
            key,
            value
        );
    }

    if (textContent !== null) {

        node.textContent =
            textContent;
    }

    return node;
}