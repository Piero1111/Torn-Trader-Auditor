/*
 * =============================================================
 * APP.JS
 * =============================================================
 *
 * Router / orquestador de toda la interfaz TornW3B.
 *
 * Responsabilidades:
 *
 *   1. Montar el FAB arrastrable (posición persistida).
 *   2. Abrir/cerrar el panel principal al tocar el FAB.
 *   3. Mantener la pila de navegación entre pantallas.
 *   4. Resolver, para cada pantalla, las dependencias y datos
 *      adicionales que necesita (audit, internalPrice, config)
 *      ANTES de montarla.
 *   5. Destruir correctamente la vista anterior (listeners,
 *      timeouts) antes de montar la siguiente.
 *
 * Contrato de navegación usado por TODAS las vistas:
 *
 *     onNavigate(screen: string, params？: Object, options？: { replace: boolean })
 *
 * Mapa de pantallas (screen → view):
 *
 *     main            → mainView
 *     sale            → saleView
 *     audit           → auditView            (lista de alertas)
 *     auditProduct    → auditProductView
 *     market          → marketView
 *     distribution    → distributionView
 *     competition     → competitionView
 *     learning        → learningView
 *     history         → historyView (general)
 *     historyProduct  → historyView (producto)
 *     historyPeriod   → historyView (período)
 *     settings        → settingsView
 * =============================================================
 */

import {
    injectStyles,
    el
} from "./styles.js";

import { renderMainView } from "./mainView.js";
import { renderSaleView } from "./saleView.js";
import { renderAuditView } from "./auditView.js";
import { renderAuditProductView } from "./auditProductView.js";
import { renderMarketView } from "./marketView.js";
import { renderDistributionView } from "./distributionView.js";
import { renderCompetitionView } from "./competitionView.js";
import { renderLearningView } from "./learningView.js";
import {
    renderHistoryGeneralView,
    renderHistoryProductView,
    renderHistoryPeriodView
} from "./historyView.js";
import { renderSettingsView } from "./settingsView.js";


const FAB_POSITION_KEY =
    "tw3b_fab_position";


/* =============================================================
 * TABLA DE RUTAS
 * =============================================================
 *
 * Cada entrada recibe (params, ctx) y devuelve una Promise que
 * resuelve a { node, destroy }. ctx expone todas las
 * dependencias de negocio + helpers de navegación.
 * ============================================================= */

const routes = {

    /* =====================================================
     * MAIN
     * ===================================================== */



    /* =====================================================
     * SALE
     * ===================================================== */

    async sale(params, ctx) {

        const item =
            params.item;

        let audit =
            params.audit ||
            null;

        if (
            !audit &&
            item &&
            ctx.scheduler
        ) {

            try {

                audit =
                    await ctx.scheduler.getOrAudit(
                        item
                    );

            } catch (error) {

                console.error(
                    "[App] Error obteniendo auditoría para Venta:",
                    error
                );
            }
        }

        return renderSaleView({

            item,

            audit,

            onNavigate:
                ctx.navigate
        });
    },


    /* =====================================================
     * AUDIT (lista de alertas)
     * ===================================================== */

    async audit(params, ctx) {

        return renderAuditView({

            pricelist:
                ctx.pricelist,

            storage:
                ctx.storage,

            scheduler:
                ctx.scheduler,

            onNavigate:
                ctx.navigate,

            onBack:
                ctx.back
        });
    },


    /* =====================================================
     * AUDIT PRODUCT
     * ===================================================== */

    async auditProduct(params, ctx) {

        let w3bUserId =
            null;

        try {

            const config =
                await ctx.storage.getConfig();

            w3bUserId =
                config?.w3bUserId ||
                null;

        } catch (error) {

            console.error(
                "[App] Error obteniendo configuración:",
                error
            );
        }

        return renderAuditProductView({

            item:
                params.item,

            audit:
                params.audit,

            w3bUserId,

            priceUpdateService:
                ctx.priceUpdateService,

            pricelist:
                ctx.pricelist,

            onNavigate:
                ctx.navigate,

            onBack:
                ctx.back,

            onAuditUpdated:
                ctx.handleAuditUpdated
        });
    },


    /* =====================================================
     * MARKET
     * ===================================================== */

    async market(params, ctx) {

        return renderMarketView({

            item:
                params.item,

            audit:
                params.audit,

            onNavigate:
                ctx.navigate,

            onBack:
                ctx.back
        });
    },


    /* =====================================================
     * DISTRIBUTION
     * ===================================================== */

    async distribution(params, ctx) {

        return renderDistributionView({

            audit:
                params.audit,

            onBack:
                ctx.back
        });
    },


    /* =====================================================
     * COMPETITION
     * ===================================================== */

    async competition(params, ctx) {

        return renderCompetitionView({

            audit:
                params.audit,

            onBack:
                ctx.back
        });
    },


    /* =====================================================
     * LEARNING
     * ===================================================== */

    async learning(params, ctx) {

        let internalPrice =
            null;

        if (
            params.item &&
            ctx.storage
        ) {

            try {

                internalPrice =
                    await ctx.storage.getInternalPrice(
                        params.item.itemId
                    );

            } catch (error) {

                console.error(
                    "[App] Error obteniendo precio interno:",
                    error
                );
            }
        }

        return renderLearningView({

            audit:
                params.audit,

            internalPrice,

            onBack:
                ctx.back
        });
    },


    /* =====================================================
     * HISTORY (general)
     * ===================================================== */

    async history(params, ctx) {

        return renderHistoryGeneralView({

            history:
                ctx.history,

            pricelist:
                ctx.pricelist,

            onNavigate:
                ctx.navigate,

            onBack:
                ctx.back
        });
    },


    /* =====================================================
     * HISTORY PRODUCT
     * ===================================================== */

    async historyProduct(params, ctx) {

        return renderHistoryProductView({

            item:
                params.item,

            history:
                ctx.history,

            onNavigate:
                ctx.navigate,

            onBack:
                ctx.back
        });
    },


    /* =====================================================
     * HISTORY PERIOD
     * ===================================================== */

    async historyPeriod(params, ctx) {

        return renderHistoryPeriodView({

            item:
                params.item,

            period:
                params.period,

            history:
                ctx.history,

            auditHistory:
                ctx.auditHistory,

            onBack:
                ctx.back
        });
    },


    /* =====================================================
     * SETTINGS
     * ===================================================== */

    async settings(params, ctx) {

        return renderSettingsView({

            storage:
                ctx.storage,

            tornAPI:
                ctx.tornAPI,

            w3bAPI:
                ctx.w3bAPI,

            pricelist:
                ctx.pricelist,
            scheduler:
                ctx.scheduler,

            onBack:
                ctx.back,

            onCredentialsSaved:
                ctx.handleCredentialsSaved
        });
    }
};


/* =============================================================
 * CREAR APP
 * =============================================================
 *
 * @param {Object} deps - todas las instancias de negocio ya
 *                        construidas por main.js:
 *
 *   pricelist, storage, scheduler, history, auditHistory,
 *   tornAPI, w3bAPI, priceUpdateService
 *
 * @returns {{ mount: Function, destroy: Function }}
 */

export function createApp(deps) {

    injectStyles();


    /* =====================================================
     * ESTADO DE NAVEGACIÓN
     * ===================================================== */
    const stack =
        [];


    let currentView =
        null;

    let isOpen =
        false;

    let isQuickBarOpen =
        false;

    let quickBarView =
        null;

    let navigationToken =
        0;


    /* =====================================================
     * CONTEXTO COMPARTIDO CON LAS VISTAS
     * ===================================================== */

    const ctx = {

        ...deps,

        navigate,

        back,

        handleAuditUpdated,

        handleCredentialsSaved
    };


    /* =====================================================
     * DOM RAÍZ
     * ===================================================== */

    const fab =
        el("div", {

            className:
                "tw3b-fab",

            text:
                "TW",

            attrs: {
                role: "button",
                "aria-label": "Abrir TornW3B"
            }
        });


    const panelContent =
        el("div", {

            style: {
                width: "100%",
                height: "100%",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column"
            }
        });


    const panel =
        el("div", {

            className:
                "tw3b-panel"

        }, [
            panelContent
        ]);


    const overlay =
        el("div", {

            className:
                "tw3b-overlay",

            style: {
                display: "none"
            },

            on: {

                click: (event) => {

                    /*
                     * Cerrar solo si se tocó el fondo,
                     * no el panel en sí.
                     */

                    if (event.target === overlay) {

                        closePanel();
                    }
                }
            }

        }, [
            panel
        ]);
         const quickBarContent =
        el("div", {

            style: {
                width: "100%"
            }
        });

    const quickBar =
        el("div", {

            className:
                "tw3b-quickbar",

            style: {
                display: "none"
            }

        }, [
            quickBarContent
        ]);


    fab.addEventListener(
        "click",
        (event) => {

            /*
             * Evitar que un "click" disparado justo después
             * de arrastrar abra/cierre el panel accidentalmente.
             */

            if (fab.dataset.dragged === "true") {

                fab.dataset.dragged =
                    "false";

                return;
            }

            togglePanel();
        }
    );


    setupFabDrag(
        fab
    );


    document.body.appendChild(
        fab
    );

    document.body.appendChild(
        overlay
    );

    document.body.appendChild(
        quickBar
    );


    window.addEventListener(
        "resize",
        () => {

            if (isQuickBarOpen) {

                positionQuickBar();
            }

            if (isOpen) {

                positionPanel();
            }
        }
    );


    /* =====================================================
     * ABRIR / CERRAR PANEL
     * ===================================================== */

    function openPanel() {

        isOpen =
            true;

        overlay.style.display =
            "block";

        renderCurrentScreen();

        positionPanel();
    }


    function closePanel() {

        isOpen =
            false;

        overlay.style.display =
            "none";
    }


    /*
     * =====================================================
     * QUICKBAR (menú principal — flota junto al FAB)
     * =====================================================
     *
     * Ya no es una pantalla dentro del panel: es un elemento
     * flotante independiente que se reposiciona cada vez que
     * el FAB se arrastra.
     */
    function positionPanel() {

        const fabRect =
            fab.getBoundingClientRect();

        const margin =
            12;

        const panelWidth =
            Math.min(
                440,
                window.innerWidth - margin * 2
            );

        panel.style.width =
            `${panelWidth}px`;

        let left =
            fabRect.right - panelWidth;

        left =
            clamp(
                left,
                margin,
                window.innerWidth - panelWidth - margin
            );

        const panelHeight =
            panel.offsetHeight ||
            300;

        let top =
            fabRect.top - panelHeight - 12;

        if (top < margin) {

            /*
             * No hay espacio arriba del FAB: mostramos
             * el panel debajo, igual que hace la quickbar.
             */

            top =
                fabRect.bottom + 12;
        }

        top =
            clamp(
                top,
                margin,
                window.innerHeight - panelHeight - margin
            );

        panel.style.left =
            `${left}px`;

        panel.style.top =
            `${top}px`;
    }

    function positionQuickBar() {

        const fabRect =
            fab.getBoundingClientRect();

        const margin =
            12;

        const barWidth =
            Math.min(
                320,
                window.innerWidth - margin * 2
            );

        quickBar.style.width =
            `${barWidth}px`;

        let left =
            fabRect.right - barWidth;

        left =
            clamp(
                left,
                margin,
                window.innerWidth - barWidth - margin
            );

        const barHeight =
            quickBar.offsetHeight ||
            52;

        let top =
            fabRect.top - barHeight - 12;

        if (top < margin) {

            /*
             * No hay espacio arriba del FAB (está pegado al
             * borde superior): mostramos la barra debajo.
             */

            top =
                fabRect.bottom + 12;
        }

        top =
            clamp(
                top,
                margin,
                window.innerHeight - barHeight - margin
            );

        quickBar.style.left =
            `${left}px`;

        quickBar.style.top =
            `${top}px`;
    }


    function handleOutsideQuickBarClick(event) {

        if (
            quickBar.contains(event.target) ||
            fab.contains(event.target)
        ) {

            return;
        }

        closeQuickBar();
    }


    function openQuickBar() {

        isQuickBarOpen =
            true;

        quickBarView =
            renderMainView({

                pricelist:
                    deps.pricelist,

                onNavigate:
                    navigate
            });

        quickBarContent.innerHTML =
            "";

        quickBarContent.appendChild(
            quickBarView.node
        );

        quickBar.style.display =
            "flex";

        positionQuickBar();

        document.addEventListener(
            "pointerdown",
            handleOutsideQuickBarClick,
            true
        );
    }


    function closeQuickBar() {

        if (!isQuickBarOpen) {
            return;
        }

        isQuickBarOpen =
            false;

        quickBar.style.display =
            "none";

        document.removeEventListener(
            "pointerdown",
            handleOutsideQuickBarClick,
            true
        );

        if (
            quickBarView &&
            typeof quickBarView.destroy === "function"
        ) {

            try {

                quickBarView.destroy();

            } catch {
                // Ignorar.
            }
        }

        quickBarView =
            null;

        quickBarContent.innerHTML =
            "";
    }


    function togglePanel() {

        if (isOpen) {

            closePanel();

            return;
        }

        if (isQuickBarOpen) {

            closeQuickBar();

        } else {

            openQuickBar();
        }
    }


    /* =====================================================
     * NAVEGACIÓN
     * =====================================================
     *
     * @param {string} screen
     * @param {Object} [params]
     * @param {Object} [options]
     * @param {boolean} [options.replace]
     */

    function navigate(screen, params = {}, options = {}) {

        /*
         * "main" ya no es una pantalla dentro del panel: es
         * "volver a casa" — cerramos todo y dejamos solo el
         * FAB. El usuario vuelve a tocarlo para abrir la
         * quickbar de nuevo.
         */

        if (screen === "main") {

            stack.length =
                0;

            closeQuickBar();

            closePanel();

            return;
        }


        if (
            !routes[screen]
        ) {

            console.error(
                `[App] Pantalla desconocida: "${screen}"`
            );

            return;
        }


        if (options.replace) {

            stack.pop();
        }


        stack.push({
            screen,
            params
        });


        closeQuickBar();

        if (!isOpen) {

            openPanel();

        } else {

            renderCurrentScreen();
        }
    }


    /* =====================================================
     * VOLVER
     * ===================================================== */

    function back() {

        if (stack.length <= 1) {

            /*
             * Ya estamos en la raíz (Main): no hay a dónde
             * volver dentro del panel. Cerramos el panel.
             */

            closePanel();

            return;
        }


        stack.pop();

        renderCurrentScreen();
    }


    /* =====================================================
     * RENDER DE LA PANTALLA ACTUAL
     * =====================================================
     *
     * `navigationToken` evita "carreras": si el usuario
     * navega rápido varias veces mientras una vista async
     * anterior todavía se está resolviendo, la resolución
     * vieja se descarta al llegar tarde.
     */

    async function renderCurrentScreen() {

        const token =
            ++navigationToken;

        const top =
            stack[stack.length - 1];

        const routeFn =
            routes[top.screen];


        showLoading();


        let result =
            null;

        try {

            result =
                await routeFn(
                    top.params || {},
                    ctx
                );

        } catch (error) {

            console.error(
                `[App] Error renderizando "${top.screen}":`,
                error
            );

            if (token !== navigationToken) {
                return;
            }

            showError(
                error?.message ||
                "Ocurrió un error inesperado."
            );

            return;
        }


        if (token !== navigationToken) {

            /*
             * Llegó tarde: otra navegación ya ocurrió
             * mientras esto se resolvía. Destruimos el
             * resultado obsoleto sin montarlo.
             */

            try {

                result?.destroy?.();

            } catch {
                // Ignorar.
            }

            return;
        }


        mountView(
            result
        );
    }


    /* =====================================================
     * MONTAJE / DESMONTAJE
     * ===================================================== */

    function mountView(result) {

        if (
            currentView &&
            typeof currentView.destroy === "function"
        ) {

            try {

                currentView.destroy();

            } catch (error) {

                console.warn(
                    "[App] Error destruyendo vista anterior:",
                    error
                );
            }
        }


        currentView =
            result;

        panelContent.innerHTML =
            "";

        if (result?.node) {

            panelContent.appendChild(
                result.node
            );
        }


        if (isOpen) {

            positionPanel();
        }
    }


    function showLoading() {

        panelContent.innerHTML =
            "";

        panelContent.appendChild(

            el("div", {

                style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "#9aa0ac",
                    fontSize: "13px"
                },

                text:
                    "Cargando..."
            })
        );

        if (isOpen) {

            positionPanel();
        }
    }


    function showError(message) {

        panelContent.innerHTML =
            "";

        panelContent.appendChild(

            el("div", {

                style: {
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    gap: "12px",
                    padding: "24px",
                    textAlign: "center"
                }

            }, [

                el("div", {

                    style: {
                        color: "#e64953",
                        fontSize: "13px"
                    },

                    text:
                        message
                }),

                el("button", {

                    className:
                        "tw3b-btn tw3b-btn-secondary",

                    style: {
                        width: "auto",
                        padding: "8px 20px"
                    },

                    text:
                        "Volver al inicio",

                    on: {

                        click: () => {

                            stack.length =
                                0;

                            stack.push({
                                screen: "main",
                                params: {}
                            });

                            renderCurrentScreen();
                        }
                    }
                })
            ])
        );
        if (isOpen) {

            positionPanel();
        }
    }


    /* =====================================================
     * CALLBACKS DE NEGOCIO
     * ===================================================== */

    function handleAuditUpdated(itemId) {

        const numericId =
            Number(itemId);

        if (
            deps.scheduler &&
            deps.scheduler.lastAuditByItem &&
            typeof deps.scheduler.lastAuditByItem.delete ===
            "function"
        ) {

            /*
             * Invalida el caché de "última auditoría" para
             * que la próxima visita a este artículo dispare
             * una auditoría fresca contra el valor recién
             * aprendido, en vez de reutilizar la comparación
             * vieja.
             */

            deps.scheduler.lastAuditByItem.delete(
                numericId
            );
        }
    }


    function handleCredentialsSaved() {

        /*
         * Si el Scheduler todavía no se inició (primera
         * configuración de credenciales), lo arrancamos
         * ahora que ya hay algo que auditar.
         */

        if (
            deps.scheduler &&
            typeof deps.scheduler.start === "function" &&
            !deps.scheduler.started
        ) {

            deps.scheduler.start();
        }
    }


    /* =====================================================
     * DRAG DEL FAB
     * =====================================================
     *
     * Arrastre con Pointer Events (funciona con touch y
     * mouse). Posición persistida en localStorage.
     */

    function setupFabDrag(node) {

        restoreFabPosition(
            node
        );


        let dragging =
            false;

        let startX =
            0;

        let startY =
            0;

        let originLeft =
            0;

        let originTop =
            0;


        node.addEventListener(
            "pointerdown",
            (event) => {

                dragging =
                    true;

                node.dataset.dragged =
                    "false";

                startX =
                    event.clientX;

                startY =
                    event.clientY;

                const rect =
                    node.getBoundingClientRect();

                originLeft =
                    rect.left;

                originTop =
                    rect.top;

                node.setPointerCapture?.(
                    event.pointerId
                );
            }
        );


        node.addEventListener(
            "pointermove",
            (event) => {

                if (!dragging) {
                    return;
                }

                const deltaX =
                    event.clientX - startX;

                const deltaY =
                    event.clientY - startY;


                if (
                    Math.abs(deltaX) > 4 ||
                    Math.abs(deltaY) > 4
                ) {

                    node.dataset.dragged =
                        "true";
                }


                const nextLeft =
                    clamp(
                        originLeft + deltaX,
                        0,
                        window.innerWidth - node.offsetWidth
                    );

                const nextTop =
                    clamp(
                        originTop + deltaY,
                        0,
                        window.innerHeight - node.offsetHeight
                    );


               node.style.left =
                    `${nextLeft}px`;

                node.style.top =
                    `${nextTop}px`;

                node.style.right =
                    "auto";

                node.style.bottom =
                    "auto";


                if (isQuickBarOpen) {

                    positionQuickBar();
                }

                if (isOpen) {

                    positionPanel();
                }
            }
        );

        const endDrag = () => {

            if (!dragging) {
                return;
            }

            dragging =
                false;

            saveFabPosition(
                node
            );

            if (isQuickBarOpen) {

                positionQuickBar();
            }

            if (isOpen) {

                positionPanel();
            }
        };


        node.addEventListener(
            "pointerup",
            endDrag
        );

        node.addEventListener(
            "pointercancel",
            endDrag
        );
    }


    function restoreFabPosition(node) {

        let saved =
            null;

        try {

            const raw =
                localStorage.getItem(
                    FAB_POSITION_KEY
                );

            saved =
                raw
                    ? JSON.parse(raw)
                    : null;

        } catch {

            saved =
                null;
        }


        if (
            saved &&
            Number.isFinite(saved.left) &&
            Number.isFinite(saved.top)
        ) {

            node.style.left =
                `${saved.left}px`;

            node.style.top =
                `${saved.top}px`;

            node.style.right =
                "auto";

            node.style.bottom =
                "auto";

        } else {

            /*
             * Posición inicial por defecto: esquina
             * inferior derecha, sobre la UI de TornPDA.
             */

            node.style.right =
                "16px";

            node.style.bottom =
                "80px";
        }
    }


    function saveFabPosition(node) {

        try {

            const rect =
                node.getBoundingClientRect();

            localStorage.setItem(

                FAB_POSITION_KEY,

                JSON.stringify({
                    left: rect.left,
                    top: rect.top
                })
            );

        } catch (error) {

            console.warn(
                "[App] No se pudo guardar la posición del FAB:",
                error
            );
        }
    }


    function clamp(value, min, max) {

        return Math.min(
            Math.max(value, min),
            max
        );
    }


    /* =====================================================
     * API PÚBLICA
     * ===================================================== */

    return {

        openPanel,

        closePanel,

        togglePanel,


        destroy() {

            if (
                currentView &&
                typeof currentView.destroy === "function"
            ) {

                try {

                    currentView.destroy();

                } catch {
                    // Ignorar.
                }
            }

            closeQuickBar();

            fab.remove();

            overlay.remove();

            quickBar.remove();
        }
    };
}