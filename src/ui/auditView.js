/*
 * =============================================================
 * AUDITVIEW.JS
 * =============================================================
 *
 * Auditor — lista principal de alertas.
 *
 * ┌──────────────────────────────┐
 * │ 🔎 Buscar artículo...        │
 * │ 🔴 Reproductor de CD   ›     │
 * │ 🔴 Xanax                 ›    │
 * │ 🟡 Bottle of Beer       ›    │
 * └──────────────────────────────┘
 *
 * Regla del mock:
 *
 *   - Sin búsqueda   → solo aparecen 🔴 y 🟡 (nunca 🟢).
 *   - Con búsqueda   → aparece cualquier artículo que coincida,
 *                       sin importar su color.
 *
 * IMPORTANTE — origen de los datos:
 *
 *   La lista principal NUNCA dispara auditorías nuevas: lee
 *   exclusivamente lo que el ciclo pasivo de Scheduler ya
 *   calculó (storage.getAllAudits()). Auditar bajo demanda
 *   aquí saturaría la cola y el rate limit de la Torn API.
 *
 *   La búsqueda manual SÍ es una acción explícita del usuario:
 *   al TOCAR un resultado (no al escribir) se llama a
 *   scheduler.getOrAudit(item), que reutiliza caché vigente o
 *   dispara una auditoría prioritaria si hace falta.
 * =============================================================
 */

import {
    el,
    createScreen,
    createContent,
    createHeader,
    createEmptyState,
    statusEmoji
} from "./styles.js";

import {
    createSearchBar
} from "./search.js";


/* =============================================================
 * RENDER
 * =============================================================
 *
 * @param {Object} deps
 * @param {Object} deps.pricelist   - instancia de Pricelist
 * @param {Object} deps.storage     - instancia de Storage
 * @param {Object} deps.scheduler   - instancia de Scheduler
 * @param {Function} deps.onNavigate
 * @param {Function} deps.onBack
 *
 * @returns {{ node: HTMLElement, destroy: Function }}
 */

export async function renderAuditView({
    pricelist,
    storage,
    scheduler,
    onNavigate,
    onBack
}) {

    let searchBarRef =
        null;

    let destroyed =
        false;


    const header =
        createHeader({

            title:
                "Auditor",

            onBack
        });


    const resultsContainer =
        el("div", {

            style: {
                display: "flex",
                flexDirection: "column"
            }
        });


    /* =====================================================
     * NAVEGAR A UN PRODUCTO
     * =====================================================
     *
     * Fila propia (no reutiliza createListItem) porque
     * necesitamos poder reemplazar su contenido por
     * "Auditando..." mientras se resuelve.
     */

    function createProductRow({
        item,
        prefix
    }) {

        const nameNode =
            el("div", {

                className:
                    "tw3b-list-item-name",

                text:
                    item.name
            });

        const chevron =
            el("span", {

                className:
                    "tw3b-list-item-chevron",

                text:
                    "›"
            });

        const row =
            el("div", {

                className:
                    "tw3b-list-item",

                attrs: {
                    role: "button"
                },

                on: {

                    click: async () => {

                        if (
                            row.dataset.loading ===
                            "true"
                        ) {

                            return;
                        }

                        row.dataset.loading =
                            "true";

                        nameNode.textContent =
                            "Auditando...";

                        chevron.style.visibility =
                            "hidden";

                        try {

                            const audit =
                                await scheduler.getOrAudit(
                                    item
                                );


                            if (destroyed) {
                                return;
                            }

                            if (!audit) {

                                throw new Error(
                                    "Artículo descartado o sin datos."
                                );
                            }


                            onNavigate(
                                "auditProduct",
                                { item, audit }
                            );

                        } catch (error) {

                            console.error(
                                "[AuditView] Error auditando artículo:",
                                error
                            );

                            if (destroyed) {
                                return;
                            }

                            nameNode.textContent =
                                item.name;

                            chevron.style.visibility =
                                "visible";

                            row.dataset.loading =
                                "false";

                            showTransientError(
                                error?.message ||
                                "No se pudo auditar el artículo."
                            );
                        }
                    }
                }

            }, [

                el("span", {
                    text: prefix
                }),

                nameNode,

                chevron
            ]);

        return row;
    }


    /* =====================================================
     * ERROR TRANSITORIO
     * =====================================================
     */

    const errorBanner =
        el("div", {

            style: {
                fontSize: "12px",
                color: "#e64953",
                textAlign: "center",
                padding: "6px 0",
                display: "none"
            }
        });


    let errorTimeoutHandle =
        null;

    function showTransientError(message) {

        errorBanner.textContent =
            message;

        errorBanner.style.display =
            "block";

        if (errorTimeoutHandle) {

            clearTimeout(
                errorTimeoutHandle
            );
        }

        errorTimeoutHandle =
            setTimeout(
                () => {

                    if (!destroyed) {

                        errorBanner.style.display =
                            "none";
                    }
                },
                3000
            );
    }


    /* =====================================================
     * LISTA PRINCIPAL (SOLO CACHÉ, 🔴 y 🟡)
     * ===================================================== */

    const STATUS_PRIORITY = {
        RED: 0,
        YELLOW: 1
    };


    async function loadAlertEntries() {

        const items =
            await pricelist.getAll();

        const audits =
            await storage.getAllAudits();


        const entries =
            [];


        for (const item of items) {

            const audit =
                audits[item.itemId];

            if (!audit) {
                continue;
            }

            if (
                audit.status !== "RED" &&
                audit.status !== "YELLOW"
            ) {
                continue;
            }

            entries.push({
                item,
                audit
            });
        }


        entries.sort((a, b) => {

            const priorityA =
                STATUS_PRIORITY[a.audit.status] ??
                99;

            const priorityB =
                STATUS_PRIORITY[b.audit.status] ??
                99;

            if (priorityA !== priorityB) {

                return priorityA - priorityB;
            }

            const diffA =
                Math.abs(
                    Number(a.audit.differencePercent) || 0
                );

            const diffB =
                Math.abs(
                    Number(b.audit.differencePercent) || 0
                );

            return diffB - diffA;
        });


        return entries;
    }


    async function renderAlertList() {

        resultsContainer.innerHTML =
            "";

        let entries =
            [];

        try {

            entries =
                await loadAlertEntries();

        } catch (error) {

            console.error(
                "[AuditView] Error cargando alertas:",
                error
            );

            resultsContainer.appendChild(

                createEmptyState(
                    "Ocurrió un error al cargar las alertas."
                )
            );

            return;
        }

        if (destroyed) {
            return;
        }

        if (entries.length === 0) {

            resultsContainer.appendChild(

                createEmptyState(
                    "No hay alertas pendientes. Todos los " +
                    "artículos auditados están dentro del margen."
                )
            );

            return;
        }

        for (const entry of entries) {

            resultsContainer.appendChild(

                createProductRow({

                    item:
                        entry.item,

                    prefix:
                        statusEmoji(
                            entry.audit.status
                        )
                })
            );
        }
    }


    /* =====================================================
     * BÚSQUEDA (CUALQUIER COLOR)
     * ===================================================== */

    async function renderSearchList(query) {

        resultsContainer.innerHTML =
            "";

        let matches =
            [];

        try {

            matches =
                await pricelist.search(
                    query
                );

        } catch (error) {

            console.error(
                "[AuditView] Error buscando artículos:",
                error
            );

            resultsContainer.appendChild(

                createEmptyState(
                    "Ocurrió un error al buscar."
                )
            );

            return;
        }

        if (destroyed) {
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


        /*
         * Lectura de estado cacheado (local, sin red)
         * para pintar el prefijo de color de cada
         * resultado de búsqueda.
         */

        for (const item of matches) {

            let cachedAudit =
                null;

            try {

                cachedAudit =
                    await storage.getAudit(
                        item.itemId
                    );

            } catch {

                cachedAudit =
                    null;
            }

            if (destroyed) {
                return;
            }

            resultsContainer.appendChild(

                createProductRow({

                    item,

                    prefix:
                        cachedAudit
                            ? statusEmoji(cachedAudit.status)
                            : "⚪"
                })
            );
        }
    }


    /* =====================================================
     * BARRA DE BÚSQUEDA
     * ===================================================== */

    searchBarRef =
        createSearchBar({

            placeholder:
                "Buscar artículo...",

            onSearch: (query) => {

                if (!query) {

                    renderAlertList();

                } else {

                    renderSearchList(
                        query
                    );
                }
            }
        });


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


    /* =====================================================
     * CARGA INICIAL
     * ===================================================== */

    await renderAlertList();


    /* =====================================================
     * ESTRUCTURA FINAL
     * ===================================================== */

    const screen =
        createScreen([

            header,

            searchWrap,

            errorBanner,

            createContent([
                resultsContainer
            ])
        ]);


    return {

        node:
            screen,


        destroy() {

            destroyed =
                true;

            if (errorTimeoutHandle) {

                clearTimeout(
                    errorTimeoutHandle
                );
            }

            if (searchBarRef) {

                searchBarRef.destroy();
            }
        }
    };
}