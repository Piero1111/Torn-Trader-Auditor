
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


async function start() {

    /*
     * =========================================================
     * STORAGE + CONFIG
     * =========================================================
     */

    const storage =
        new Storage();

    const config =
        await storage.getConfig();


    /*
     * =========================================================
     * APP
     * =========================================================
     *
     * Creamos la aplicación desde el principio.
     *
     * El contexto comienza solamente con:
     *
     *     storage
     *     config
     *
     * Las demás dependencias se agregan
     * cuando terminan de inicializarse.
     */

    const app =
        buildApp(
            storage,
            config
        );


    app.mount();


    /*
     * =========================================================
     * CREDENCIALES
     * =========================================================
     */

    if (
        !config.tornApiKey ||
        !config.w3bUserId
    ) {

        console.warn(
            "[TornW3B] Faltan credenciales — " +
            "abrí Configuración desde el menú para ingresarlas."
        );

        return;
    }


    /*
     * =========================================================
     * DEPENDENCIAS
     * =========================================================
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
     * =========================================================
     * SCHEDULER
     * =========================================================
     *
     * El Scheduler ahora se encarga de:
     *
     * 1. Auditoría prioritaria al buscar un artículo.
     *
     * 2. Utilizar cache si fue auditado hace menos
     *    de CONFIG.AUDIT_INTERVAL.
     *
     * 3. Auditoría pasiva periódica.
     *
     * 4. Procesamiento progresivo de artículos.
     *
     * 5. Evitar auditorías duplicadas.
     */

    const scheduler =
        new Scheduler({
            auditor,
            pricelist,
            storage,
            history,
            concurrency: 1
        });


    console.log(
        "[TornW3B] Dependencias inicializadas"
    );


    /*
     * =========================================================
     * SINCRONIZAR PRICELIST
     * =========================================================
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
     * =========================================================
     * HISTORY
     * =========================================================
     */

    await history.init();


    /*
     * =========================================================
     * SCHEDULER INIT
     * =========================================================
     *
     * Recupera:
     *
     * - timestamps de auditorías existentes
     * - artículos inválidos
     *
     * IMPORTANTE:
     * todavía NO comienza la auditoría pasiva.
     */

    await scheduler.init();


    /*
     * =========================================================
     * CALLBACKS DEL SCHEDULER
     * =========================================================
     */

    scheduler.onAuditComplete =
        (result) => {

            console.log(
                `[TornW3B] Auditoría completa: ` +
                `${result.itemName} → ${result.status}`
            );


            /*
             * Actualizar inmediatamente
             * el contador del icono de auditoría.
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
     * =========================================================
     * INYECTAR DEPENDENCIAS EN APP
     * =========================================================
     *
     * app.ctx es el mismo objeto que fue creado
     * originalmente por buildApp().
     *
     * Al hacer Object.assign() agregamos todas
     * las dependencias sin reconstruir la App.
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
     * =========================================================
     * INICIAR AUDITORÍA PASIVA
     * =========================================================
     *
     * AHORA SÍ iniciamos el Scheduler.
     *
     * Esto NO significa:
     *
     *     auditar 1000 artículos inmediatamente.
     *
     * El Scheduler solamente:
     *
     *     - toma una pequeña tanda
     *     - respeta la cola
     *     - respeta concurrency
     *     - espera CONFIG.AUDIT_INTERVAL
     *     - vuelve a revisar artículos pendientes
     *
     * Mientras tanto, una búsqueda puede poner
     * un artículo al frente de la cola mediante
     * getOrAudit().
     */

    scheduler.start();


    /*
     * Actualizar el badge una vez que
     * todo está inicializado.
     */

    await app.refreshAlertBadge();


    /*
     * =========================================================
     * API GLOBAL DE DEBUG
     * =========================================================
     *
     * Permite inspeccionar el sistema desde
     * la consola del navegador.
     */

    window.TornW3B = {

        tornAPI,

        w3bAPI,

        storage,

        pricelist,

        marketAnalyzer,

        ratioLearner,

        auditor,

        history,

        scheduler,

        app
    };


    console.log(
        "[TornW3B] Sistema iniciado correctamente"
    );
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
     *
     * App solamente se encarga de:
     *
     * - navegación
     * - panel
     * - FAB
     * - conexión búsqueda → Scheduler → SaleView
     *
     * La lógica interna de cada pantalla
     * permanece en su propio archivo.
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
 * START
 * =========================================================
 */

start().catch(
    (error) => {

        console.error(
            "[TornW3B] Error fatal al iniciar:",
            error
        );
    }
);
