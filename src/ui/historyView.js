
import { formatMoney } from "./styles.js";

export const historyView = {

    async render(
        container,
        ctx,
        navigate,
        params = {}
    ) {

        if (params.itemId) {

            return this.renderDetail(
                container,
                ctx,
                navigate,
                params.itemId
            );
        }

        return this.renderRecent(
            container,
            ctx,
            navigate
        );
    },


    /*
     * =========================================================
     * HISTORIAL RECIENTE
     * =========================================================
     */

    async renderRecent(
        container,
        ctx,
        navigate
    ) {

        container.innerHTML = `
            <div class="tw3b-skeleton"></div>
        `;


        let recent;

        try {

            recent =
                await ctx.history
                    .getRecentlyUpdated(10);

        } catch (error) {

            console.error(
                "[TornW3B] Error cargando historial reciente:",
                error
            );

            container.innerHTML = `
                <div class="tw3b-error">
                    No se pudo cargar el historial.
                </div>
            `;

            return null;
        }


        if (
            !Array.isArray(recent) ||
            recent.length === 0
        ) {

            container.innerHTML = `
                <div class="tw3b-card-sub">
                    Todavía no hay historial registrado.
                </div>
            `;

            return null;
        }


        let audits = {};

        try {

            audits =
                await ctx.storage
                    .getAllAudits();

        } catch (error) {

            console.warn(
                "[TornW3B] No se pudieron cargar las auditorías:",
                error
            );
        }


        container.innerHTML = "";


        for (
            const entry
            of recent
        ) {

            if (!entry) {
                continue;
            }


            const itemId =
                Number(
                    entry.itemId
                );


            const audit =
                audits?.[entry.itemId] ||
                audits?.[itemId];


            const itemName =
                audit?.itemName ||
                `Item ${itemId}`;


            const timestamp =
                Number(
                    entry.lastHistoryUpdate
                );


            const dateText =
                Number.isFinite(timestamp)
                    ? new Date(
                        timestamp
                    ).toLocaleDateString()
                    : "-";


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "tw3b-card";


            card.innerHTML = `

                <div class="tw3b-card-title">
                    ${escapeHtml(
                        itemName
                    )}
                </div>


                <div class="tw3b-card-sub">
                    Última actualización:
                    ${escapeHtml(
                        dateText
                    )}
                </div>

            `;


            card.addEventListener(
                "click",
                () => {

                    navigate(
                        "history",
                        {
                            itemId
                        }
                    );
                }
            );


            container.appendChild(
                card
            );
        }


        return null;
    },


    /*
     * =========================================================
     * DETALLE DEL HISTORIAL
     * =========================================================
     */

    async renderDetail(
        container,
        ctx,
        navigate,
        itemId
    ) {

        container.innerHTML = `

            <div class="tw3b-skeleton"></div>
            <div class="tw3b-skeleton"></div>

        `;


        let summary;
        let series;
        let audit;


        try {

            [
                summary,
                series,
                audit
            ] = await Promise.all([

                ctx.history.getSummary(
                    itemId
                ),

                ctx.history.getSeries(
                    itemId
                ),

                ctx.storage.getAudit(
                    itemId
                )

            ]);

        } catch (error) {

            console.error(
                "[TornW3B] Error cargando detalle del historial:",
                error
            );


            container.innerHTML = `
                <div class="tw3b-error">
                    No se pudo cargar el historial
                    de este artículo.
                </div>
            `;

            return null;
        }


        if (
            !Array.isArray(series) ||
            series.length === 0
        ) {

            container.innerHTML = `
                <div class="tw3b-card-sub">
                    No hay historial para este artículo todavía.
                </div>
            `;

            return null;
        }


        container.innerHTML = `

            <div class="tw3b-card-title">
                ${escapeHtml(
                    audit?.itemName ||
                    `Item ${itemId}`
                )}
            </div>


            ${summaryRow(
                "Ayer",
                summary?.yesterday
            )}


            ${summaryRow(
                "Últimos 7 días",
                summary?.last7d
            )}


            ${summaryRow(
                "Últimos 30 días",
                summary?.last30d
            )}


            ${summaryRow(
                "Últimos 6 meses",
                summary?.last6m
            )}


            <div
                class="tw3b-card-sub"
                style="margin-top: 10px;"
            >
                Evolución (Real Market Value)
            </div>


            <div id="tw3b-history-series"></div>

        `;


        const seriesEl =
            container.querySelector(
                "#tw3b-history-series"
            );


        /*
         * Mostramos solamente los últimos
         * 15 puntos para evitar una vista
         * excesivamente larga.
         */

        const visibleSeries =
            series.slice(-15);


        for (
            const point
            of visibleSeries
        ) {

            if (!point) {
                continue;
            }


            const timestamp =
                Number(
                    point.timestamp
                );


            const dateText =
                Number.isFinite(timestamp)

                    ? new Date(
                        timestamp
                    ).toLocaleDateString()

                    : "-";


            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "tw3b-row";


            row.innerHTML = `

                <span class="tw3b-row-label">
                    ${escapeHtml(
                        dateText
                    )}
                </span>


                <span>
                    ${formatMoney(
                        Number(
                            point.realMarketValue
                        )
                    )}
                </span>

            `;


            seriesEl.appendChild(
                row
            );
        }


        return null;
    }
};


/*
 * =========================================================
 * SUMMARY
 * =========================================================
 */

function summaryRow(
    label,
    data
) {

    if (!data) {

        return `

            <div class="tw3b-row">

                <span class="tw3b-row-label">
                    ${escapeHtml(label)}
                </span>

                <span class="tw3b-card-sub">
                    Sin datos
                </span>

            </div>

        `;
    }


    const samples =
        Number(
            data.samples
        );


    const samplesText =
        Number.isFinite(samples)
            ? samples
            : 0;


    return `

        <div class="tw3b-row">

            <span class="tw3b-row-label">
                ${escapeHtml(label)}
            </span>

            <span>
                ${formatMoney(
                    Number(
                        data.avgRealMarketValue
                    )
                )}

                ·

                ${samplesText}
                muestras
            </span>

        </div>

    `;
}


/*
 * =========================================================
 * UTILIDAD
 * =========================================================
 */

function escapeHtml(str) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        String(str ?? "");

    return div.innerHTML;
}
