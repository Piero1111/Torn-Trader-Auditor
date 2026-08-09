
import {
    formatMoney,
    formatPercent,
    statusBadgeClass
} from "./styles.js";

export const auditView = {

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

        return this.renderList(
            container,
            ctx,
            navigate
        );
    },


    /*
     * =========================================================
     * LISTA DE AUDITORÍAS
     * =========================================================
     *
     * Por defecto solo se muestran RED y YELLOW.
     *
     * Los GREEN permanecen disponibles mediante
     * el buscador manual.
     */

    async renderList(
        container,
        ctx,
        navigate
    ) {

        container.innerHTML = `
            <input
                type="text"
                class="tw3b-search"
                id="tw3b-audit-filter"
                placeholder="🔎 Buscar artículo..."
                autocomplete="off"
            >

            <div id="tw3b-audit-list">

                <div class="tw3b-skeleton"></div>
                <div class="tw3b-skeleton"></div>

            </div>
        `;


        let audits;

        try {

            audits =
                await ctx.storage.getAllAudits();

        } catch (error) {

            console.error(
                "[TornW3B] Error cargando auditorías:",
                error
            );

            container.querySelector(
                "#tw3b-audit-list"
            ).innerHTML = `
                <div class="tw3b-error">
                    No se pudieron cargar las auditorías.
                </div>
            `;

            return null;
        }


        /*
         * Convertimos el objeto de auditorías
         * en una lista limpia.
         */
        const list =
            Object.values(
                audits || {}
            )
            .filter(Boolean);


        /*
         * Orden de prioridad.
         */
        const order = {
            RED: 0,
            YELLOW: 1,
            GREEN: 2
        };


        /*
         * Ordenamos una sola vez.
         */
        list.sort(
            (a, b) =>
                (order[a.status] ?? 3) -
                (order[b.status] ?? 3)
        );


        const listEl =
            container.querySelector(
                "#tw3b-audit-list"
            );


        /*
         * =====================================================
         * RENDER
         * =====================================================
         *
         * Sin búsqueda:
         *   RED + YELLOW
         *
         * Con búsqueda:
         *   RED + YELLOW + GREEN
         *
         * Esto permite consultar manualmente
         * artículos verdes sin llenar la lista.
         */

        const renderItems =
            (filterText = "") => {

                const normalizedFilter =
                    String(
                        filterText
                    )
                    .trim()
                    .toLowerCase();


                let filtered;


                if (normalizedFilter) {

                    /*
                     * Búsqueda manual:
                     * permitimos TODOS los estados.
                     */
                    filtered =
                        list.filter(
                            audit =>
                                String(
                                    audit?.itemName || ""
                                )
                                .toLowerCase()
                                .includes(
                                    normalizedFilter
                                )
                        );

                } else {

                    /*
                     * Vista inicial:
                     * únicamente alertas.
                     */
                    filtered =
                        list.filter(
                            audit =>
                                audit?.status === "RED" ||
                                audit?.status === "YELLOW"
                        );
                }


                if (
                    filtered.length === 0
                ) {

                    listEl.innerHTML = `

                        <div class="tw3b-card-sub">

                            ${
                                normalizedFilter
                                    ? "No se encontró ningún artículo auditado."
                                    : "No hay artículos en rojo o amarillo."
                            }

                        </div>
                    `;

                    return;
                }


                listEl.innerHTML =
                    "";


                for (
                    const audit
                    of filtered
                ) {

                    const card =
                        document.createElement(
                            "div"
                        );


                    card.className =
                        "tw3b-card";


                    const confidence =
                        Number(
                            audit.confidence
                        );


                    const confidenceText =
                        Number.isFinite(
                            confidence
                        )
                            ? `${confidence}%`
                            : "-";


                    card.innerHTML = `

                        <div class="tw3b-card-title">

                            ${escapeHtml(
                                audit.itemName
                            )}

                            <span class="${statusBadgeClass(
                                audit.status
                            )}">
                                ${escapeHtml(
                                    audit.status
                                )}
                            </span>

                        </div>


                        <div class="tw3b-card-sub">

                            ${formatMoney(
                                Number(
                                    audit.w3bBuyPrice
                                )
                            )}

                            →

                            ${formatMoney(
                                Number(
                                    audit.correctBuyPrice
                                )
                            )}

                            · confianza
                            ${confidenceText}

                        </div>
                    `;


                    card.addEventListener(
                        "click",
                        () => {

                            navigate(
                                "audit",
                                {
                                    itemId:
                                        audit.itemId
                                }
                            );
                        }
                    );


                    listEl.appendChild(
                        card
                    );
                }
            };


        /*
         * Render inicial.
         *
         * Aquí NO aparecerán los GREEN.
         */
        renderItems();


        const filter =
            container.querySelector(
                "#tw3b-audit-filter"
            );


        filter.addEventListener(
            "input",
            event => {

                renderItems(
                    event.target.value
                );
            }
        );


        return null;
    },


    /*
     * =========================================================
     * DETALLE
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


        let audit;

        try {

            audit =
                await ctx.storage.getAudit(
                    itemId
                );

        } catch (error) {

            console.error(
                "[TornW3B] Error obteniendo auditoría:",
                error
            );

            container.innerHTML = `
                <div class="tw3b-error">
                    No se pudo cargar la auditoría.
                </div>
            `;

            return null;
        }


        if (!audit) {

            container.innerHTML = `
                <div class="tw3b-error">
                    No hay datos de auditoría
                    para este artículo.
                </div>
            `;

            return null;
        }


        const confidence =
            Number(
                audit.confidence
            );


        const confidenceText =
            Number.isFinite(
                confidence
            )
                ? `${confidence}%`
                : "-";


        container.innerHTML = `

            <div class="tw3b-card-title">
                ${escapeHtml(
                    audit.itemName
                )}
            </div>


            ${row(
                "Item Value",
                formatMoney(
                    Number(
                        audit.itemValue
                    )
                )
            )}


            ${row(
                "W3B Buy",
                formatMoney(
                    Number(
                        audit.w3bBuyPrice
                    )
                )
            )}


            ${row(
                "Observed W3B",
                formatPercent(
                    Number(
                        audit.observedRatio
                    )
                )
            )}


            ${row(
                "Learned W3B",
                formatPercent(
                    Number(
                        audit.learnedRatio
                    )
                )
            )}


            ${row(
                "Market Units",
                formatNumber(
                    audit.totalMarketQuantity
                )
            )}


            ${row(
                "Sample",
                formatNumber(
                    audit.sampleQuantity
                )
            )}


            ${row(
                "Weighted Mean",
                formatMoney(
                    Number(
                        audit.weightedMean
                    )
                )
            )}


            ${row(
                "Weighted Median",
                formatMoney(
                    Number(
                        audit.weightedMedian
                    )
                )
            )}


            ${row(
                "Real Market Value",
                formatMoney(
                    Number(
                        audit.realMarketValue
                    )
                )
            )}


            ${row(
                "Correct Buy",
                formatMoney(
                    Number(
                        audit.correctBuyPrice
                    )
                )
            )}


            ${row(
                "Difference",
                formatPercent(
                    Number(
                        audit.differencePercent
                    )
                )
            )}


            ${row(
                "Confidence",
                confidenceText
            )}


            ${row(
                "Status",
                `
                    <span class="${statusBadgeClass(
                        audit.status
                    )}">
                        ${escapeHtml(
                            audit.status
                        )}
                    </span>
                `
            )}


            <button
                class="tw3b-button"
                id="tw3b-view-history"
                style="margin-top: 10px;"
            >
                Ver historial
            </button>
        `;


        const historyButton =
            container.querySelector(
                "#tw3b-view-history"
            );


        historyButton.addEventListener(
            "click",
            () => {

                navigate(
                    "history",
                    {
                        itemId:
                            audit.itemId
                    }
                );
            }
        );


        return null;
    }
};


/*
 * =========================================================
 * UTILIDADES
 * =========================================================
 */

function row(
    label,
    value
) {

    return `
        <div class="tw3b-row">

            <span class="tw3b-row-label">
                ${escapeHtml(label)}
            </span>

            <span>
                ${value}
            </span>

        </div>
    `;
}


function formatNumber(value) {

    const number =
        Number(value);


    if (
        !Number.isFinite(number)
    ) {

        return "-";
    }


    return number.toLocaleString(
        "en-US"
    );
}


function escapeHtml(str) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        String(str ?? "");


    return div.innerHTML;
}
