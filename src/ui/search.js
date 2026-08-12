/*
 * =============================================================
 * SEARCH.JS
 * =============================================================
 *
 * Componente de búsqueda reutilizable.
 *
 * Usado en:
 *
 *   - Menú principal      → busca en Pricelist  → Venta
 *   - Auditor (lista)     → busca en Pricelist  → Auditor Producto
 *   - Historial (general) → busca en Pricelist  → Historial Producto
 *
 * Responsabilidad única: capturar texto del usuario y notificar
 * mediante `onSearch(query)` cuando corresponde.
 *
 * NO decide qué hacer con los resultados: eso lo maneja
 * cada vista que lo instancia.
 *
 * Reglas:
 *
 *   - No se dispara onSearch mientras query.length está entre
 *     1 y (CONFIG.SEARCH_MIN_LENGTH - 1).
 *   - query.length === 0 SIEMPRE dispara onSearch("") para que
 *     la vista pueda limpiar resultados.
 *   - Debounce de 150ms para no recalcular en cada tecla.
 * =============================================================
 */

import { CONFIG } from "../config.js";
import { el } from "./styles.js";


/* =============================================================
 * CREAR BARRA DE BÚSQUEDA
 * =============================================================
 *
 * @param {Object} options
 * @param {string} options.placeholder
 * @param {Function} options.onSearch  (query: string) => void
 * @param {string} [options.autofocus]
 *
 * @returns {{ node: HTMLElement, destroy: Function, clear: Function, focus: Function }}
 */

export function createSearchBar({
    placeholder = "Buscar artículo...",
    onSearch,
    autofocus = false
}) {

    let debounceHandle =
        null;


    const input =
        el("input", {

            className:
                "tw3b-search-input",

            attrs: {

                type:
                    "text",

                placeholder,

                autocomplete:
                    "off",

                autocapitalize:
                    "off",

                spellcheck:
                    "false"
            }
        });


    /*
     * =====================================================
     * MANEJADOR DE INPUT
     * =====================================================
     */

    const handleInput = () => {

        const query =
            input.value
                .trim();


        if (debounceHandle) {

            clearTimeout(
                debounceHandle
            );
        }


        /*
         * Limpiar resultados inmediatamente,
         * sin esperar debounce.
         */

        if (query.length === 0) {

            if (
                typeof onSearch ===
                "function"
            ) {

                onSearch("");
            }

            return;
        }


        /*
         * Todavía no alcanza el mínimo
         * de caracteres.
         */

        if (
            query.length < CONFIG.SEARCH_MIN_LENGTH
        ) {

            return;
        }


        debounceHandle =
            setTimeout(
                () => {

                    if (
                        typeof onSearch ===
                        "function"
                    ) {

                        onSearch(
                            query
                        );
                    }
                },
                150
            );
    };


    input.addEventListener(
        "input",
        handleInput
    );


    /*
     * =====================================================
     * ÍCONO
     * =====================================================
     */

    const icon =
        el("span", {

            text:
                "🔎",

            style: {
                fontSize: "14px",
                opacity: "0.7"
            }
        });


    /*
     * =====================================================
     * BOTÓN LIMPIAR (aparece solo con texto)
     * =====================================================
     */

    const clearButton =
        el("span", {

            text:
                "✕",

            style: {
                fontSize:
                    "13px",
                color:
                    "#6b7280",
                cursor:
                    "pointer",
                display:
                    "none",
                padding:
                    "2px 4px"
            },

            on: {

                click: () => {

                    input.value =
                        "";

                    clearButton.style.display =
                        "none";

                    handleInput();

                    input.focus();
                }
            }
        });


    input.addEventListener(
        "input",
        () => {

            clearButton.style.display =
                input.value.length > 0
                    ? "flex"
                    : "none";
        }
    );


    const wrap =
        el("div", {

            className:
                "tw3b-search-wrap"

        }, [
            icon,
            input,
            clearButton
        ]);


    /*
     * =====================================================
     * AUTOFOCUS
     * =====================================================
     *
     * Se aplica en el siguiente tick para asegurar que
     * el nodo ya esté insertado en el DOM.
     */

    if (autofocus) {

        setTimeout(
            () => {

                try {

                    input.focus();

                } catch {
                    // Ignorar: puede fallar si el nodo
                    // fue removido antes del tick.
                }
            },
            0
        );
    }


    /*
     * =====================================================
     * API PÚBLICA
     * =====================================================
     */

    return {

        node:
            wrap,


        clear() {

            input.value =
                "";

            clearButton.style.display =
                "none";
        },


        focus() {

            input.focus();
        },


        destroy() {

            if (debounceHandle) {

                clearTimeout(
                    debounceHandle
                );
            }

            input.removeEventListener(
                "input",
                handleInput
            );
        }
    };
}


/* =============================================================
 * LISTA DE RESULTADOS DE BÚSQUEDA
 * =============================================================
 *
 * Fábrica auxiliar para pintar los resultados debajo de la
 * barra. No hace fetch ni busca nada: solo recibe `items`
 * (ya filtrados por Pricelist.search()) y los pinta.
 *
 * @param {Array} items          - resultado de pricelist.search()
 * @param {Function} onSelect    - (item) => void
 * @param {Function} [getPrefix] - (item) => string (ej: emoji de estado)
 */

export function renderSearchResults({
    items,
    onSelect,
    getPrefix = null
}) {

    const container =
        el("div", {

            style: {
                display:
                    "flex",
                flexDirection:
                    "column"
            }
        });


    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {

        return container;
    }


    for (const item of items) {

        const prefix =
            typeof getPrefix ===
            "function"
                ? getPrefix(item)
                : null;


        const row =
            el("div", {

                className:
                    "tw3b-list-item",

                attrs: {
                    role: "button"
                },

                on: {

                    click: () => {

                        if (
                            typeof onSelect ===
                            "function"
                        ) {

                            onSelect(
                                item
                            );
                        }
                    }
                }

            }, [

                prefix
                    ? el("span", {
                        text: prefix
                    })
                    : null,

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
            ]);


        container.appendChild(
            row
        );
    }


    return container;
}