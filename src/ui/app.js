
import {
    injectStyles
} from "./styles.js";


const VIEWS = {

    MENU: "menu",
    SALE: "sale",
    AUDIT: "audit",
    HISTORY: "history",
    SETTINGS: "settings"
};


/*
 * =========================================================
 * IDENTIFICADORES GLOBALES
 * =========================================================
 *
 * Estos IDs permiten garantizar que solamente exista
 * una instancia visual de TornW3B en el documento.
 */

const FAB_ID =
    "tornw3b-fab";

const PANEL_ID =
    "tornw3b-panel";

const APP_INSTANCE_KEY =
    "__TornW3B_App_Instance__";


export class App {

    constructor(ctx, views = {}) {

        this.ctx =
            ctx;

        this.views =
            views;


        this.currentView =
            VIEWS.MENU;

        this.activeViewInstance =
            null;


        this.fab =
            null;

        this.panel =
            null;

        this.panelBody =
            null;


        this.searchInput =
            null;

        this.iconBar =
            null;


        /*
         * =====================================================
         * ESTADO
         * =====================================================
         */

        this.mounted =
            false;

        this.destroyed =
            false;


        /*
         * =====================================================
         * FAB
         * =====================================================
         */

        this.fabPositionKey =
            "tornw3b-fab-position";

        this.isDraggingFab =
            false;

        this.fabDragOffsetX =
            0;

        this.fabDragOffsetY =
            0;

        this.fabWasDragged =
            false;


        /*
         * =====================================================
         * LISTENERS
         * =====================================================
         */

        this.boundResize =
            null;

        this.boundFabPointerDown =
            null;

        this.boundFabPointerMove =
            null;

        this.boundFabPointerUp =
            null;

        this.boundFabPointerCancel =
            null;

        this.boundFabClick =
            null;
    }


    /*
     * =========================================================
     * MOUNT
     * =========================================================
     */

    mount() {

        /*
         * -----------------------------------------------------
         * Protección contra múltiples mount() de la misma
         * instancia.
         * -----------------------------------------------------
         */

        if (this.mounted) {

            console.warn(
                "[TornW3B] App.mount() ignorado: " +
                "la aplicación ya está montada."
            );

            return;
        }


        /*
         * -----------------------------------------------------
         * Protección GLOBAL.
         *
         * Si otra instancia de App existe, la destruimos
         * antes de crear una nueva.
         * -----------------------------------------------------
         */

        const previousApp =
            window[APP_INSTANCE_KEY];


        if (
            previousApp &&
            previousApp !== this &&
            typeof previousApp.destroy === "function"
        ) {

            console.warn(
                "[TornW3B] Se detectó una instancia anterior. " +
                "Destruyéndola antes de montar la nueva."
            );


            try {

                previousApp.destroy();

            } catch (error) {

                console.warn(
                    "[TornW3B] Error destruyendo instancia anterior:",
                    error
                );
            }
        }


        /*
         * -----------------------------------------------------
         * Limpieza defensiva del DOM.
         *
         * Incluso si una instancia anterior quedó incompleta,
         * nunca permitimos múltiples FAB/panel.
         * -----------------------------------------------------
         */

        document
            .querySelectorAll(
                `#${FAB_ID}`
            )
            .forEach(
                element => {

                    element.remove();

                }
            );


        document
            .querySelectorAll(
                `#${PANEL_ID}`
            )
            .forEach(
                element => {

                    element.remove();

                }
            );


        /*
         * Registrar esta instancia como la única activa.
         */

        window[APP_INSTANCE_KEY] =
            this;


        this.mounted =
            true;

        this.destroyed =
            false;


        /*
         * =====================================================
         * ESTILOS
         * =====================================================
         */

        injectStyles();


        /*
         * =====================================================
         * FAB
         * =====================================================
         */

        this.fab =
            document.createElement(
                "button"
            );


        this.fab.id =
            FAB_ID;


        this.fab.className =
            "tw3b-fab";


        this.fab.type =
            "button";


        this.fab.innerHTML =
            "💰";


        this.fab.setAttribute(
            "aria-label",
            "Abrir TornW3B Trader"
        );


        this.fab.style.touchAction =
            "none";


        /*
         * Posición guardada.
         */

        this.loadFabPosition();


        /*
         * Arrastre.
         */

        this.enableFabDragging();


        /*
         * =====================================================
         * PANEL
         * =====================================================
         */

        this.panel =
            document.createElement(
                "div"
            );


        this.panel.id =
            PANEL_ID;


        this.panel.className =
            "tw3b-panel";


        this.panelBody =
            document.createElement(
                "div"
            );


        this.panelBody.className =
            "tw3b-panel-body";


        this.panel.appendChild(
            this.panelBody
        );


        /*
         * =====================================================
         * DOM
         * =====================================================
         */

        document.body.appendChild(
            this.fab
        );


        document.body.appendChild(
            this.panel
        );


        /*
         * =====================================================
         * RESIZE
         * =====================================================
         */

        this.boundResize =
            () => {

                if (
                    this.destroyed
                ) {

                    return;
                }


                this.keepFabInsideViewport();


                if (
                    this.panel &&
                    this.panel.classList.contains(
                        "open"
                    )
                ) {

                    this.updatePanelPosition();
                }
            };


        window.addEventListener(
            "resize",
            this.boundResize
        );


        /*
         * =====================================================
         * MENÚ INICIAL
         * =====================================================
         */

        this.renderMenu();


        this.refreshAlertBadge();
    }


    /*
     * =========================================================
     * DESTROY
     * =========================================================
     */

    destroy() {

        if (
            this.destroyed
        ) {

            return;
        }


        this.destroyed =
            true;

        this.mounted =
            false;


        /*
         * Detener vista activa.
         */

        if (
            this.activeViewInstance &&
            typeof this.activeViewInstance.destroy ===
            "function"
        ) {

            try {

                this.activeViewInstance.destroy();

            } catch (error) {

                console.warn(
                    "[TornW3B] Error destruyendo vista:",
                    error
                );
            }
        }


        this.activeViewInstance =
            null;


        /*
         * Eliminar resize listener.
         */

        if (
            this.boundResize
        ) {

            window.removeEventListener(
                "resize",
                this.boundResize
            );

            this.boundResize =
                null;
        }


        /*
         * Eliminar listeners del FAB.
         */

        this.removeFabListeners();


        /*
         * Eliminar FAB.
         */

        if (
            this.fab &&
            this.fab.parentNode
        ) {

            this.fab.parentNode.removeChild(
                this.fab
            );
        }


        /*
         * Eliminar panel.
         */

        if (
            this.panel &&
            this.panel.parentNode
        ) {

            this.panel.parentNode.removeChild(
                this.panel
            );
        }


        this.fab =
            null;

        this.panel =
            null;

        this.panelBody =
            null;

        this.searchInput =
            null;

        this.iconBar =
            null;


        /*
         * Limpieza defensiva.
         */

        document
            .querySelectorAll(
                `#${FAB_ID}`
            )
            .forEach(
                element => {

                    element.remove();

                }
            );


        document
            .querySelectorAll(
                `#${PANEL_ID}`
            )
            .forEach(
                element => {

                    element.remove();

                }
            );


        /*
         * Solo eliminar la referencia global
         * si esta instancia sigue siendo la activa.
         */

        if (
            window[APP_INSTANCE_KEY] ===
            this
        ) {

            window[APP_INSTANCE_KEY] =
                null;
        }
    }


    /*
     * =========================================================
     * REMOVE FAB LISTENERS
     * =========================================================
     */

    removeFabListeners() {

        if (!this.fab) {
            return;
        }


        if (
            this.boundFabPointerDown
        ) {

            this.fab.removeEventListener(
                "pointerdown",
                this.boundFabPointerDown
            );

            this.boundFabPointerDown =
                null;
        }


        if (
            this.boundFabPointerMove
        ) {

            this.fab.removeEventListener(
                "pointermove",
                this.boundFabPointerMove
            );

            this.boundFabPointerMove =
                null;
        }


        if (
            this.boundFabPointerUp
        ) {

            this.fab.removeEventListener(
                "pointerup",
                this.boundFabPointerUp
            );

            this.boundFabPointerUp =
                null;
        }


        if (
            this.boundFabPointerCancel
        ) {

            this.fab.removeEventListener(
                "pointercancel",
                this.boundFabPointerCancel
            );

            this.boundFabPointerCancel =
                null;
        }


        if (
            this.boundFabClick
        ) {

            this.fab.removeEventListener(
                "click",
                this.boundFabClick
            );

            this.boundFabClick =
                null;
        }
    }


    /*
     * =========================================================
     * FAB POSITION
     * =========================================================
     */

    loadFabPosition() {

        if (!this.fab) {
            return;
        }


        try {

            const raw =
                localStorage.getItem(
                    this.fabPositionKey
                );


            if (!raw) {
                return;
            }


            const position =
                JSON.parse(raw);


            if (
                !position ||
                !Number.isFinite(
                    Number(position.left)
                ) ||
                !Number.isFinite(
                    Number(position.top)
                )
            ) {

                return;
            }


            this.fab.style.left =
                `${Number(position.left)}px`;


            this.fab.style.top =
                `${Number(position.top)}px`;


            this.fab.style.right =
                "auto";


            this.fab.style.bottom =
                "auto";


        } catch (error) {

            console.warn(
                "[TornW3B] No se pudo recuperar la posición del botón:",
                error
            );
        }
    }


    saveFabPosition() {

        if (!this.fab) {
            return;
        }


        const rect =
            this.fab.getBoundingClientRect();


        try {

            localStorage.setItem(
                this.fabPositionKey,
                JSON.stringify({

                    left:
                        Math.round(
                            rect.left
                        ),

                    top:
                        Math.round(
                            rect.top
                        )
                })
            );


        } catch (error) {

            console.warn(
                "[TornW3B] No se pudo guardar la posición del botón:",
                error
            );
        }
    }


    keepFabInsideViewport() {

        if (!this.fab) {
            return;
        }


        const rect =
            this.fab.getBoundingClientRect();


        const hasExplicitPosition =
            this.fab.style.left ||
            this.fab.style.top;


        if (!hasExplicitPosition) {
            return;
        }


        const width =
            this.fab.offsetWidth;


        const height =
            this.fab.offsetHeight;


        let left =
            rect.left;


        let top =
            rect.top;


        left =
            Math.max(
                0,
                Math.min(
                    left,
                    window.innerWidth -
                    width
                )
            );


        top =
            Math.max(
                0,
                Math.min(
                    top,
                    window.innerHeight -
                    height
                )
            );


        this.fab.style.left =
            `${left}px`;


        this.fab.style.top =
            `${top}px`;


        this.fab.style.right =
            "auto";


        this.fab.style.bottom =
            "auto";


        this.saveFabPosition();
    }


    /*
     * =========================================================
     * FAB DRAGGING
     * =========================================================
     */

    enableFabDragging() {

        if (!this.fab) {
            return;
        }


        let pointerMoved =
            false;


        let pointerDownX =
            0;


        let pointerDownY =
            0;


        const DRAG_THRESHOLD =
            6;


        /*
         * POINTER DOWN
         */

        this.boundFabPointerDown =
            event => {

                if (
                    this.destroyed
                ) {

                    return;
                }


                if (
                    event.pointerType === "mouse" &&
                    event.button !== 0
                ) {

                    return;
                }


                this.isDraggingFab =
                    true;


                pointerMoved =
                    false;


                this.fabWasDragged =
                    false;


                pointerDownX =
                    event.clientX;


                pointerDownY =
                    event.clientY;


                const rect =
                    this.fab.getBoundingClientRect();


                this.fabDragOffsetX =
                    event.clientX -
                    rect.left;


                this.fabDragOffsetY =
                    event.clientY -
                    rect.top;


                this.fab.style.left =
                    `${rect.left}px`;


                this.fab.style.top =
                    `${rect.top}px`;


                this.fab.style.right =
                    "auto";


                this.fab.style.bottom =
                    "auto";


                try {

                    this.fab.setPointerCapture(
                        event.pointerId
                    );

                } catch {
                    // Ignorar.
                }
            };


        /*
         * POINTER MOVE
         */

        this.boundFabPointerMove =
            event => {

                if (
                    !this.isDraggingFab
                ) {

                    return;
                }


                const deltaX =
                    Math.abs(
                        event.clientX -
                        pointerDownX
                    );


                const deltaY =
                    Math.abs(
                        event.clientY -
                        pointerDownY
                    );


                if (
                    !pointerMoved &&
                    deltaX < DRAG_THRESHOLD &&
                    deltaY < DRAG_THRESHOLD
                ) {

                    return;
                }


                pointerMoved =
                    true;


                this.fabWasDragged =
                    true;


                const width =
                    this.fab.offsetWidth;


                const height =
                    this.fab.offsetHeight;


                let left =
                    event.clientX -
                    this.fabDragOffsetX;


                let top =
                    event.clientY -
                    this.fabDragOffsetY;


                left =
                    Math.max(
                        0,
                        Math.min(
                            left,
                            window.innerWidth -
                            width
                        )
                    );


                top =
                    Math.max(
                        0,
                        Math.min(
                            top,
                            window.innerHeight -
                            height
                        )
                    );


                this.fab.style.left =
                    `${left}px`;


                this.fab.style.top =
                    `${top}px`;


                this.fab.style.right =
                    "auto";


                this.fab.style.bottom =
                    "auto";


                if (
                    this.panel &&
                    this.panel.classList.contains(
                        "open"
                    )
                ) {

                    this.updatePanelPosition();
                }


                if (
                    event.cancelable
                ) {

                    event.preventDefault();
                }
            };


        /*
         * POINTER UP
         */

        this.boundFabPointerUp =
            event => {

                if (
                    !this.isDraggingFab
                ) {

                    return;
                }


                this.isDraggingFab =
                    false;


                try {

                    if (
                        this.fab.hasPointerCapture(
                            event.pointerId
                        )
                    ) {

                        this.fab.releasePointerCapture(
                            event.pointerId
                        );
                    }

                } catch {
                    // Ignorar.
                }


                if (pointerMoved) {

                    this.saveFabPosition();


                    if (
                        this.panel &&
                        this.panel.classList.contains(
                            "open"
                        )
                    ) {

                        this.updatePanelPosition();
                    }


                    setTimeout(
                        () => {

                            if (!this.destroyed) {

                                this.fabWasDragged =
                                    false;
                            }

                        },
                        100
                    );
                }
            };


        /*
         * POINTER CANCEL
         */

        this.boundFabPointerCancel =
            event => {

                if (
                    !this.isDraggingFab
                ) {

                    return;
                }


                this.isDraggingFab =
                    false;


                this.saveFabPosition();


                this.fabWasDragged =
                    false;


                try {

                    if (
                        this.fab.hasPointerCapture(
                            event.pointerId
                        )
                    ) {

                        this.fab.releasePointerCapture(
                            event.pointerId
                        );
                    }

                } catch {
                    // Ignorar.
                }
            };


        /*
         * CLICK
         */

        this.boundFabClick =
            event => {

                if (
                    this.fabWasDragged
                ) {

                    event.preventDefault();
                    event.stopPropagation();

                    return;
                }


                this.toggle();
            };


        /*
         * Registrar listeners.
         */

        this.fab.addEventListener(
            "pointerdown",
            this.boundFabPointerDown
        );


        this.fab.addEventListener(
            "pointermove",
            this.boundFabPointerMove,
            {
                passive: false
            }
        );


        this.fab.addEventListener(
            "pointerup",
            this.boundFabPointerUp
        );


        this.fab.addEventListener(
            "pointercancel",
            this.boundFabPointerCancel
        );


        this.fab.addEventListener(
            "click",
            this.boundFabClick
        );
    }


    /*
     * =========================================================
     * PANEL POSITION
     * =========================================================
     */

    updatePanelPosition() {

        if (
            !this.fab ||
            !this.panel
        ) {

            return;
        }


        const fabRect =
            this.fab.getBoundingClientRect();


        const panelWidth =
            this.panel.offsetWidth ||
            320;


        const panelHeight =
            this.panel.offsetHeight ||
            400;


        const gap =
            10;


        let left =
            fabRect.left;


        let top;


        if (
            fabRect.bottom +
            gap +
            panelHeight <=
            window.innerHeight
        ) {

            top =
                fabRect.bottom +
                gap;

        } else {

            top =
                fabRect.top -
                panelHeight -
                gap;
        }


        left =
            Math.max(
                8,
                Math.min(
                    left,
                    window.innerWidth -
                    panelWidth -
                    8
                )
            );


        top =
            Math.max(
                8,
                Math.min(
                    top,
                    window.innerHeight -
                    panelHeight -
                    8
                )
            );


        this.panel.style.left =
            `${left}px`;


        this.panel.style.top =
            `${top}px`;


        this.panel.style.right =
            "auto";


        this.panel.style.bottom =
            "auto";
    }


    /*
     * =========================================================
     * PANEL
     * =========================================================
     */

    toggle() {

        if (!this.panel) {
            return;
        }


        if (
            this.panel.classList.contains(
                "open"
            )
        ) {

            this.close();

        } else {

            this.open();
        }
    }


    open() {

        if (
            this.destroyed ||
            !this.panel
        ) {

            return;
        }


        this.panel.classList.add(
            "open"
        );


        requestAnimationFrame(
            () => {

                if (
                    this.destroyed
                ) {

                    return;
                }


                this.updatePanelPosition();
            }
        );


        if (this.searchInput) {

            setTimeout(
                () => {

                    if (
                        !this.destroyed &&
                        this.searchInput
                    ) {

                        this.searchInput.focus();
                    }

                },
                100
            );
        }
    }


    close() {

        if (!this.panel) {
            return;
        }


        this.panel.classList.remove(
            "open"
        );


        this.hideSuggestions();
    }


    /*
     * =========================================================
     * MENÚ PRINCIPAL
     * =========================================================
     */

    renderMenu() {

        if (
            this.destroyed ||
            !this.panelBody
        ) {

            return;
        }


        this.currentView =
            VIEWS.MENU;


        this.activeViewInstance =
            null;


        this.panelBody.innerHTML =
            "";


        const toolbar =
            document.createElement(
                "div"
            );


        toolbar.className =
            "tw3b-toolbar";


        /*
         * BÚSQUEDA
         */

        const searchWrapper =
            document.createElement(
                "div"
            );


        searchWrapper.className =
            "tw3b-search-wrapper";


        this.searchInput =
            document.createElement(
                "input"
            );


        this.searchInput.className =
            "tw3b-search";


        this.searchInput.type =
            "text";


        this.searchInput.placeholder =
            "🔎 Buscar artículo...";


        this.searchInput.autocomplete =
            "off";


        this.searchInput.addEventListener(
            "input",
            event => {

                this.handleSearch(
                    event.target.value
                );
            }
        );


        searchWrapper.appendChild(
            this.searchInput
        );


        /*
         * ICONOS
         */

        this.iconBar =
            document.createElement(
                "div"
            );


        this.iconBar.className =
            "tw3b-icon-bar";


        this.createIconButton({

            icon: "🛡️",

            title: "Auditoría",

            view: VIEWS.AUDIT,

            badge: true
        });


        this.createIconButton({

            icon: "📜",

            title: "Historial",

            view: VIEWS.HISTORY
        });


        this.createIconButton({

            icon: "⚙️",

            title: "Configuración",

            view: VIEWS.SETTINGS
        });


        toolbar.appendChild(
            searchWrapper
        );


        toolbar.appendChild(
            this.iconBar
        );


        this.panelBody.appendChild(
            toolbar
        );


        this.refreshAlertBadge();
    }


    /*
     * =========================================================
     * BOTONES DE ICONOS
     * =========================================================
     */

    createIconButton({
        icon,
        title,
        view,
        badge = false
    }) {

        const button =
            document.createElement(
                "button"
            );


        button.type =
            "button";


        button.className =
            "tw3b-icon-button";


        button.title =
            title;


        button.setAttribute(
            "aria-label",
            title
        );


        const iconElement =
            document.createElement(
                "span"
            );


        iconElement.className =
            "tw3b-icon";


        iconElement.textContent =
            icon;


        button.appendChild(
            iconElement
        );


        if (badge) {

            const badgeElement =
                document.createElement(
                    "span"
                );


            badgeElement.className =
                "tw3b-icon-badge";


            badgeElement.id =
                "tw3b-alert-count";


            badgeElement.textContent =
                "0";


            badgeElement.style.display =
                "none";


            button.appendChild(
                badgeElement
            );
        }


        button.addEventListener(
            "click",
            () => {

                this.navigate(
                    view
                );
            }
        );


        this.iconBar.appendChild(
            button
        );


        return button;
    }


    /*
     * =========================================================
     * BÚSQUEDA
     * =========================================================
     */

    handleSearch(query) {

        if (
            this.destroyed
        ) {

            return;
        }


        const searchModule =
            this.views.search;


        if (
            !searchModule ||
            typeof searchModule.onQuery !==
            "function"
        ) {

            return;
        }


        searchModule.onQuery(

            query,

            this.ctx,

            async item => {

                await this.selectSearchItem(
                    item
                );
            },

            this.searchInput
        );
    }


    /*
     * =========================================================
     * SELECCIÓN DE ARTÍCULO
     * =========================================================
     */

    async selectSearchItem(item) {

        if (
            !item ||
            this.destroyed
        ) {

            return;
        }


        this.hideSuggestions();


        if (!this.ctx.scheduler) {

            console.warn(
                "[TornW3B] Scheduler todavía no está disponible."
            );


            return;
        }


        this.showLoading(
            item.name
        );


        try {

            console.log(
                `[TornW3B] Auditoría prioritaria: ${item.name}`
            );


            const result =
                await this.ctx.scheduler
                    .getOrAudit(item);


            if (!result) {

                this.showError(
                    item.name,
                    "Este artículo no puede ser auditado por Torn."
                );


                return;
            }


            await this.navigate(
                VIEWS.SALE,
                {
                    item,
                    audit: result
                }
            );


        } catch (error) {

            console.error(
                `[TornW3B] Error procesando ${item.name}:`,
                error
            );


            this.showError(
                item.name,
                error?.message ||
                "No se pudo auditar el artículo."
            );
        }
    }


    /*
     * =========================================================
     * LOADING
     * =========================================================
     */

    showLoading(itemName) {

        if (
            this.destroyed ||
            !this.panelBody
        ) {

            return;
        }


        this.panelBody.innerHTML = `

            <div class="tw3b-loading">

                <div class="tw3b-card-title">
                    ${escapeHtml(itemName)}
                </div>

                <div class="tw3b-skeleton"></div>

                <div class="tw3b-loading-text">
                    🔄 Analizando mercado...
                </div>

            </div>

        `;
    }


    /*
     * =========================================================
     * ERROR
     * =========================================================
     */

    showError(
        itemName,
        message
    ) {

        if (
            this.destroyed ||
            !this.panelBody
        ) {

            return;
        }


        this.panelBody.innerHTML = `

            <div class="tw3b-error-view">

                <div class="tw3b-card-title">
                    ${escapeHtml(itemName)}
                </div>

                <div class="tw3b-error">
                    ${escapeHtml(message)}
                </div>

                <button
                    type="button"
                    class="tw3b-button"
                    data-action="back-menu"
                >
                    ← Volver
                </button>

            </div>

        `;


        const back =
            this.panelBody.querySelector(
                '[data-action="back-menu"]'
            );


        if (back) {

            back.addEventListener(
                "click",
                () => {

                    this.renderMenu();

                }
            );
        }
    }


    /*
     * =========================================================
     * NAVEGACIÓN
     * =========================================================
     */

    async navigate(
        viewName,
        params = {}
    ) {

        if (
            this.destroyed
        ) {

            return;
        }


        if (
            this.activeViewInstance &&
            typeof this.activeViewInstance.destroy ===
            "function"
        ) {

            this.activeViewInstance.destroy();
        }


        this.activeViewInstance =
            null;


        this.currentView =
            viewName;


        this.hideSuggestions();


        this.panelBody.innerHTML =
            "";


        if (
            viewName ===
            VIEWS.MENU
        ) {

            this.renderMenu();

            return;
        }


        const view =
            this.views[viewName];


        if (
            !view ||
            typeof view.render !==
            "function"
        ) {

            this.showError(
                "TornW3B",
                `Vista "${viewName}" no disponible.`
            );


            return;
        }


        /*
         * Botón volver.
         */

        const back =
            document.createElement(
                "button"
            );


        back.type =
            "button";


        back.className =
            "tw3b-back";


        back.innerHTML =
            "←";


        back.title =
            "Volver";


        back.setAttribute(
            "aria-label",
            "Volver"
        );


        back.addEventListener(
            "click",
            () => {

                this.navigate(
                    VIEWS.MENU
                );
            }
        );


        this.panelBody.appendChild(
            back
        );


        /*
         * Contenedor.
         */

        const container =
            document.createElement(
                "div"
            );


        container.className =
            "tw3b-view-container";


        this.panelBody.appendChild(
            container
        );


        /*
         * Renderizar vista.
         */

        this.activeViewInstance =
            await view.render(

                container,

                this.ctx,

                (
                    nextView,
                    nextParams
                ) => {

                    this.navigate(
                        nextView,
                        nextParams
                    );
                },

                params

            ) || null;


        /*
         * Recalcular posición.
         */

        if (
            this.panel &&
            this.panel.classList.contains(
                "open"
            )
        ) {

            requestAnimationFrame(
                () => {

                    if (
                        !this.destroyed
                    ) {

                        this.updatePanelPosition();
                    }
                }
            );
        }
    }


    /*
     * =========================================================
     * SUGERENCIAS
     * =========================================================
     */

    hideSuggestions() {

        const suggestions =
            document.getElementById(
                "tw3b-suggestions"
            );


        if (suggestions) {

            suggestions.style.display =
                "none";
        }
    }


    /*
     * =========================================================
     * BADGE DE AUDITORÍA
     * =========================================================
     */

    async refreshAlertBadge() {

        if (
            this.destroyed ||
            !this.ctx.storage
        ) {

            return;
        }


        try {

            const audits =
                await this.ctx.storage
                    .getAllAudits();


            const alertCount =
                Object.values(audits)
                    .filter(
                        audit =>
                            audit &&
                            (
                                audit.status ===
                                "RED" ||

                                audit.status ===
                                "YELLOW"
                            )
                    )
                    .length;


            if (
                !this.panelBody
            ) {

                return;
            }


            const badge =
                this.panelBody.querySelector(
                    "#tw3b-alert-count"
                );


            if (badge) {

                badge.textContent =
                    String(alertCount);


                badge.style.display =
                    alertCount > 0
                        ? "flex"
                        : "none";
            }


            if (this.fab) {

                this.fab.classList.toggle(
                    "has-alerts",
                    alertCount > 0
                );
            }


        } catch (error) {

            console.warn(
                "[TornW3B] No se pudo actualizar badge:",
                error
            );
        }
    }
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


export {
    VIEWS
};
