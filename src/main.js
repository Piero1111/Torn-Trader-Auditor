
import { CONFIG } from "./config.js";

import { TornAPI } from "./api/torn.js";
import { W3BAPI } from "./api/w3b.js";

import { Storage } from "./data/storage.js";
import { Pricelist } from "./data/pricelist.js";

import { MarketAnalyzer } from "./market/marketAnalyzer.js";
import { RatioLearner } from "./auditor/ratioLearner.js";
import { Auditor } from "./auditor/auditor.js";
import { Scheduler } from "./auditor/scheduler.js";

import { History } from "./history/history.js";

import { App } from "./ui/app.js";
import { search } from "./ui/search.js";
import { saleView } from "./ui/saleView.js";
import { auditView } from "./ui/auditView.js";
import { historyView } from "./ui/historyView.js";
import { settingsView } from "./ui/settingsView.js";


/*
 * =========================================================
 * PROTECCIÓN CONTRA DOBLE INICIALIZACIÓN
 * =========================================================
 *
 * TornW3B puede ser inyectado más de una vez
 * por TornPDA / navegador / recarga parcial.
 *
 * Si ya existe una inicialización en progreso,
 * reutilizamos esa Promise.
 */

const GLOBAL_START_KEY =
    "__TORNW3B_START_PROMISE__";


/*
 * Si ya existe una instancia completamente
 * inicializada, no crear otra.
 */

if (
    window.TornW3B &&
    window.TornW3B.__initialized
) {

    console.log(
        "[TornW3B] Ya existe una instancia activa. " +
        "Se evita una segunda inicialización."
    );

} else if (
    window[GLOBAL_START_KEY]
) {

    console.log(
        "[TornW3B] Inicialización ya en progreso."
    );

} else {

    window[GLOBAL_START_KEY] =
        start();

    window[GLOBAL_START_KEY]
        .catch(
            error => {

                console.error(
                    "[TornW3B] Error fatal al iniciar:",
                    error
                );

            }
        )
        .finally(
            () => {

                /*
                 * La Promise se conserva si la aplicación
                 * quedó correctamente inicializada.
                 *
                 * Si hubo un error antes de completar
                 * la inicialización, permitimos reintentar.
                 */

                if (
                    !window.TornW3B ||
                    !window.TornW3B.__initialized
                ) {

                    delete window[
                        GLOBAL_START_KEY
                    ];
                }
            }
        );
}


/*
 * =========================================================
 * START
 * =========================================================
 */

async function start() {

    /*
     * =====================================================
     * DOBLE COMPROBACIÓN
     * =====================================================
     */

    if (
        window.TornW3B &&
        window.TornW3B.__initialized
    ) {

        console.log(
            "[TornW3B] La aplicación ya está inicializada."
        );

        return window.TornW3B;
    }


    /*
     * =====================================================
     * LIMPIAR INSTANCIA ANTERIOR
     * =====================================================
     *
     * Si existe una App vieja pero no quedó marcada
     * como completamente inicializada, la destruimos.
     */

    cleanupPreviousApp();


    /*
     * =====================================================
     * STORAGE + CONFIG
     * =====================================================
     */

    const storage =
        new Storage();


    const config =
        await storage.getConfig();


    /*
     * =====================================================
     * APP
     * =====================================================
     */

    const app =
        buildApp(
            storage,
            config
        );


    /*
     * Montar solamente una vez.
     */

    app.mount();


    /*
     * =====================================================
     * CREDENCIALES
     * =====================================================
     */

    if (
        !config.tornApiKey ||
        !config.w3bUserId
    ) {

        console.warn(
            "[TornW3B] Faltan credenciales — " +
            "abrí Configuración desde el menú para ingresarlas."
        );


        /*
         * Guardamos la instancia aunque
         * todavía no esté completamente inicializada.
         */

        window.TornW3B = {

            app,

            storage,

            config,

            __initialized: true
        };


        return window.TornW3B;
    }


    /*
     * =====================================================
     * DEPENDENCIAS
     * =====================================================
     */

    const tornAPI =
        new TornAPI(
            config.tornApiKey
        );


    const w3bAPI =
        new W3BAPI(
            config.w3bApiKey
        );


    const pricelist =
        new Pricelist({
            w3bAPI,
            storage
        });


    const marketAnalyzer =
        new MarketAnalyzer(
            CONFIG.SAMPLE_PERCENTAGE
        );


    const ratioLearner =
        new RatioLearner();


    const auditor =
        new Auditor({
            tornAPI,
            marketAnalyzer,
            ratioLearner,
            storage
        });


    const history =
        new History({
            tornAPI,
            storage
        });


    /*
     * =====================================================
     * SCHEDULER
     * =====================================================
     */

    const scheduler =
        new Scheduler({

            auditor,

            pricelist,

            storage,

            history,

            /*
             * Mantener 1 para evitar
             * sobrecargar las APIs.
             */
            concurrency: 1
        });


    console.log(
        "[TornW3B] Dependencias inicializadas"
    );


    /*
     * =====================================================
     * SINCRONIZAR PRICELIST
     * =====================================================
     */

    try {

        const pricelistItems =
            await pricelist.sync(
                config.w3bUserId
            );


        console.log(
            `[TornW3B] Pricelist sincronizada: ` +
            `${pricelistItems.items.length} items`
        );

    } catch (error) {

        console.error(
            "[TornW3B] Error sincronizando pricelist:",
            error
        );


        console.warn(
            "[TornW3B] Se utilizará la pricelist cacheada " +
            "(si existe)."
        );
    }


    /*
     * =====================================================
     * HISTORY
     * =====================================================
     */

    await history.init();


    /*
     * =====================================================
     * SCHEDULER INIT
     * =====================================================
     */

    await scheduler.init();


    /*
     * =====================================================
     * CALLBACKS
     * =====================================================
     */

    scheduler.onAuditComplete =
        result => {

            console.log(
                `[TornW3B] Auditoría completa: ` +
                `${result.itemName} → ${result.status}`
            );


            /*
             * Actualizar badge.
             */

            app.refreshAlertBadge();
        };


    scheduler.onAuditError =
        (item, error) => {

            console.error(
                `[TornW3B] Error auditando ${item.name}:`,
                error
            );
        };


    /*
     * =====================================================
     * INYECTAR DEPENDENCIAS
     * =====================================================
     */

    Object.assign(
        app.ctx,
        {

            tornAPI,

            w3bAPI,

            pricelist,

            marketAnalyzer,

            ratioLearner,

            auditor,

            history,

            scheduler
        }
    );


    /*
     * =====================================================
     * INICIAR SCHEDULER
     * =====================================================
     *
     * El Scheduler se encarga de:
     *
     * - ciclo pasivo horario
     * - completar todos los artículos
     * - prioridad de búsquedas
     * - continuar la pasiva después
     *   de una auditoría prioritaria
     * - evitar duplicados
     */

    scheduler.start();


    /*
     * =====================================================
     * BADGE INICIAL
     * =====================================================
     */

    await app.refreshAlertBadge();


    /*
     * =====================================================
     * API GLOBAL
     * =====================================================
     *
     * IMPORTANTE:
     * Marcamos la instancia como inicializada.
     */

    const instance = {

        tornAPI,

        w3bAPI,

        storage,

        config,

        pricelist,

        marketAnalyzer,

        ratioLearner,

        auditor,

        history,

        scheduler,

        app,

        __initialized: true
    };


    window.TornW3B =
        instance;


    console.log(
        "[TornW3B] Sistema iniciado correctamente"
    );


    return instance;
}


/*
 * =========================================================
 * BUILD APP
 * =========================================================
 */

function buildApp(
    storage,
    config
) {

    const ctx = {

        storage,

        config
    };


    /*
     * Cada módulo mantiene su propia vista.
     */

    const views = {

        search,

        sale: saleView,

        audit: auditView,

        history: historyView,

        settings: settingsView
    };


    return new App(
        ctx,
        views
    );
}


/*
 * =========================================================
 * CLEANUP PREVIOUS APP
 * =========================================================
 *
 * Elimina una instancia anterior del DOM.
 *
 * Esto es especialmente importante en TornPDA,
 * donde el script puede volver a ejecutarse sin
 * que la página completa se recargue.
 * =========================================================
 */

function cleanupPreviousApp() {

    /*
     * Si existe una instancia anterior,
     * intentamos detener su Scheduler.
     */

    const previous =
        window.TornW3B;


    if (
        previous
    ) {

        try {

            if (
                previous.scheduler &&
                typeof previous.scheduler.stop ===
                "function"
            ) {

                previous.scheduler.stop();
            }

        } catch (error) {

            console.warn(
                "[TornW3B] Error deteniendo Scheduler anterior:",
                error
            );
        }


        /*
         * Si la App dispone de destroy(),
         * utilizarlo.
         */

        try {

            if (
                previous.app &&
                typeof previous.app.destroy ===
                "function"
            ) {

                previous.app.destroy();
            }

        } catch (error) {

            console.warn(
                "[TornW3B] Error destruyendo App anterior:",
                error
            );
        }
    }


    /*
     * =====================================================
     * ELIMINAR FAB/PANEL RESIDUALES
     * =====================================================
     *
     * Usamos selectores específicos para no tocar
     * elementos pertenecientes a TornPDA.
     */

    document
        .querySelectorAll(
            ".tw3b-fab"
        )
        .forEach(
            element => {

                element.remove();

            }
        );


    document
        .querySelectorAll(
            ".tw3b-panel"
        )
        .forEach(
            element => {

                element.remove();

            }
        );


    /*
     * Limpiar referencia global.
     */

    delete window.TornW3B;
}
