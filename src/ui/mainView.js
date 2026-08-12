/*
 * =============================================================
 * MAINVIEW.JS  (contenido de la QUICKBAR)
 * =============================================================
 *
 * Ya NO es una pantalla completa dentro del panel. Es el
 * contenido compacto que app.js monta dentro de la quickbar
 * flotante que sigue al FAB: una barra (búsqueda + 3 iconos) y,
 * SOLO si hay texto de búsqueda, un dropdown de resultados que
 * flota sobre la página (position: absolute) sin agrandar la
 * barra ni dejar espacio vacío cuando no hay búsqueda activa.
 * =============================================================
 */

import {
    el,
    createEmptyState
} from "./styles.js";

import {
    createSearchBar,
    renderSearchResults
} from "./search.js";


/* =============================================================
 * RENDER
 * =============================================================
 *
 * @param {Object} deps
 * @param {Object} deps.pricelist   - instancia de Pricelist
 * @param {Function} deps.onNavigate
 *
 * @returns {{ node: HTMLElement, destroy: Function }}
 */

export function renderMainView({
    pricelist,
    onNavigate
}) {

    let searchBarRef =
        null;


    /* =====================================================
     * DROPDOWN DE RESULTADOS (oculto por defecto)
     * ===================================================== */

    const resultsDropdown =
        el("div", {

            className:
                "tw3b-quickbar-dropdown",

            style: {
                display: "none"
            }
        });


    function clearResults() {

        resultsDropdown.innerHTML =
            "";

        resultsDropdown.style.display =
            "none";
    }


    /* =====================================================
     * BÚSQUEDA
     * ===================================================== */

    async function handleSearch(query) {

        if (!query) {

            clearResults();

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
                "[MainView] Error buscando artículos:",
                error
            );

            resultsDropdown.innerHTML =
                "";

            resultsDropdown.appendChild(
                createEmptyState(
                    "Ocurrió un error al buscar."
                )
            );

            resultsDropdown.style.display =
                "block";

            return;
        }


        resultsDropdown.innerHTML =
            "";

        if (
            !Array.isArray(matches) ||
            matches.length === 0
        ) {

            resultsDropdown.appendChild(
                createEmptyState(
                    "Sin resultados."
                )
            );

            resultsDropdown.style.display =
                "block";

            return;
        }


        resultsDropdown.appendChild(

            renderSearchResults({

                items:
                    matches,

                onSelect: (item) => {

                    clearResults();

                    onNavigate(
                        "sale",
                        { item }
                    );
                }
            })
        );

        resultsDropdown.style.display =
            "block";
    }


    searchBarRef =
        createSearchBar({

            placeholder:
                "Buscar artículo...",

            onSearch:
                handleSearch
        });


    /* =====================================================
     * ACCESOS DIRECTOS (📊 🕘 ⚙)
     * ===================================================== */

    const shortcuts =
        el("div", {

            style: {
                display:
                    "flex",
                alignItems:
                    "center",
                gap:
                    "4px"
            }

        }, [

            createShortcutButton({
                icon: "📊",
                label: "Auditor",
                onClick: () =>
                    onNavigate("audit")
            }),

            createShortcutButton({
                icon: "🕘",
                label: "Historial",
                onClick: () =>
                    onNavigate("history")
            }),

            createShortcutButton({
                icon: "⚙",
                label: "Configuración",
                onClick: () =>
                    onNavigate("settings")
            })
        ]);


    /* =====================================================
     * BARRA
     * ===================================================== */

    const bar =
        el("div", {

            className:
                "tw3b-quickbar-bar"

        }, [

            el("div", {

                style: {
                    flex: "1"
                }

            }, [
                searchBarRef.node
            ]),

            shortcuts
        ]);


    /* =====================================================
     * ESTRUCTURA FINAL
     * =====================================================
     *
     * position: relative para que resultsDropdown (absolute,
     * top: 100%) se posicione correctamente debajo de la barra
     * sin afectar su tamaño.
     */

    const wrap =
        el("div", {

            className:
                "tw3b-root",

            style: {
                width: "100%",
                position: "relative"
            }

        }, [
            bar,
            resultsDropdown
        ]);


    return {

        node:
            wrap,


        destroy() {

            if (searchBarRef) {

                searchBarRef.destroy();
            }
        }
    };
}


/* =============================================================
 * BOTÓN DE ACCESO DIRECTO
 * ============================================================= */

function createShortcutButton({
    icon,
    label,
    onClick
}) {

    return el("button", {

        text:
            icon,

        attrs: {
            "aria-label":
                label,
            title:
                label
        },

        style: {
            width:
                "36px",
            height:
                "36px",
            minWidth:
                "36px",
            borderRadius:
                "50%",
            border:
                "1px solid #2e323d",
            background:
                "#242833",
            color:
                "#f5f6f8",
            fontSize:
                "16px",
            display:
                "flex",
            alignItems:
                "center",
            justifyContent:
                "center",
            cursor:
                "pointer"
        },

        on: {
            click: onClick
        }
    });
}