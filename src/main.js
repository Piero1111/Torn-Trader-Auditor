/*
 * =============================================================
 * MAIN.JS
 * =============================================================
 *
 * Punto de entrada del userscript TornW3B.
 *
 * Responsabilidades:
 *
 *   1. Instanciar TODAS las dependencias de negocio, respetando
 *      el orden correcto (algunas dependen de otras).
 *   2. Inicializar Scheduler + History (reconstruir caché en
 *      memoria a partir de lo ya guardado en Storage).
 *   3. Arrancar el ciclo pasivo de auditoría SOLO si ya existen
 *      credenciales guardadas. Si es la primera vez que se usa
 *      el script (sin credenciales), es settingsView quien
 *      dispara scheduler.start() la primera vez que se guardan
 *      credenciales correctamente (ver handleCredentialsSaved
 *      en app.js).
 *   4. Montar la interfaz (FAB + panel) llamando a createApp().
 *
 * NOTA: el FAB se monta directamente en document.body (ver
 * app.js → document.body.appendChild(fab)). Esto asume que
 * TornPDA renderiza el contenido en el DOM principal, sin
 * Shadow DOM ni iframe aislado.
 * =============================================================
 */

import { CONFIG } from "./config.js";

import { TornAPI } from "./api/torn.js";
import { W3BAPI } from "./api/w3b.js";

import { Storage } from "./data/storage.js";
import { Pricelist } from "./data/pricelist.js";
import { InternalPriceList } from "./data/internalPriceList.js";
import { PriceProposal } from "./data/priceProposal.js";
import { PriceUpdateService } from "./data/priceUpdateService.js";

import { History } from "./history/history.js";
import { AuditHistory } from "./auditor/auditHistory.js";
import { RatioLearner } from "./auditor/ratioLearner.js";
import { Auditor } from "./auditor/auditor.js";
import { Scheduler } from "./auditor/scheduler.js";

import { MarketAnalyzer } from "./market/marketAnalyzer.js";
import { BazaarAnalyzer } from "./market/bazaarAnalyzer.js";
import { MarketValueAnalyzer } from "./market/marketValueAnalyzer.js";

import { createApp } from "./ui/app.js";


/* =============================================================
 * EVITAR DOBLE INICIALIZACIÓN
 * =============================================================
 *
 * Algunos gestores de userscripts pueden inyectar el script
 * más de una vez (recarga de SPA dentro de TornPDA, re-inyección
 * al navegar, etc.). Sin esta guarda tendríamos dos FABs, dos
 * Schedulers corriendo en paralelo, etc.
 */

if (window.__TW3B_BOOTED__) {

    console.warn(
        "[TornW3B] main.js ya fue ejecutado en esta página. " +
        "Se ignora esta segunda ejecución."
    );

} else {

    window.__TW3B_BOOTED__ =
        true;

    boot().catch((error) => {

        console.error(
            "[TornW3B] Error fatal iniciando la aplicación:",
            error
        );
    });
}


/* =============================================================
 * BOOTSTRAP
 * ============================================================= */

async function boot() {

    await waitForBody();


    /* =====================================================
     * 1. STORAGE + CONFIGURACIÓN GUARDADA
     * =====================================================
     *
     * Storage no depende de nada. Se instancia primero
     * porque todo lo demás la necesita, directa o
     * indirectamente.
     */

    const storage =
        new Storage();


    const savedConfig =
        await storage.getConfig();


    const tornApiKey =
        savedConfig?.tornApiKey ||
        null;

    const w3bApiKey =
        savedConfig?.w3bApiKey ||
        null;

    const w3bUserId =
        savedConfig?.w3bUserId ||
        null;


    /* =====================================================
     * 2. APIS
     * =====================================================
     *
     * Se instancian aunque no haya credenciales todavía:
     * settingsView.js muta `apiKey` directamente sobre estas
     * mismas instancias en cuanto el usuario las guarda, sin
     * necesidad de reinstanciar nada (ver punto 2 en
     * settingsView.js).
     */

    const tornAPI =
        new TornAPI(
            tornApiKey
        );

    const w3bAPI =
        new W3BAPI(
            w3bApiKey
        );


    /* =====================================================
     * 3. CAPA DE DATOS
     * ===================================================== */

    const pricelist =
        new Pricelist({
            w3bAPI,
            storage
        });

    const internalPriceList =
        new InternalPriceList(
            storage
        );

    const priceProposal =
        new PriceProposal();

    const priceUpdateService =
        new PriceUpdateService({
            internalPriceList
        });


    /* =====================================================
     * 4. HISTORIAL
     * ===================================================== */

    const history =
        new History({
            tornAPI,
            storage
        });

    const auditHistory =
        new AuditHistory(
            storage
        );


    /* =====================================================
     * 5. ANÁLISIS DE MERCADO
     * ===================================================== */

    const marketAnalyzer =
        new MarketAnalyzer(
            CONFIG.SAMPLE_PERCENTAGE
        );

    const bazaarAnalyzer =
        new BazaarAnalyzer();

    const marketValueAnalyzer =
        new MarketValueAnalyzer();


    /* =====================================================
     * 6. AUDITOR
     * ===================================================== */

    const ratioLearner =
        new RatioLearner();

    const auditor =
        new Auditor({

            tornAPI,

            w3bAPI,

            marketAnalyzer,

            bazaarAnalyzer,

            marketValueAnalyzer,

            ratioLearner,

            storage,

            priceProposal,

            internalPriceList,

            w3bUserId
        });


    /* =====================================================
     * 7. SCHEDULER
     * ===================================================== */

    const scheduler =
        new Scheduler({

            auditor,

            pricelist,

            storage,

            history,

            auditHistory
        });


    /* =====================================================
     * 8. INICIALIZAR CACHÉS EN MEMORIA
     * =====================================================
     *
     * Reconstruyen sus mapas internos (lastAuditByItem,
     * invalidItems, lastDayByItem) a partir de lo que ya
     * existe en Storage. No dispara ninguna petición HTTP.
     */

    await Promise.all([

        scheduler.init(),

        history.init()
    ]);


    /* =====================================================
     * 9. ARRANCAR CICLO PASIVO (SOLO SI YA HAY CREDENCIALES)
     * =====================================================
     *
     * Si el usuario todavía no configuró Torn API Key +
     * W3B User ID, NO arrancamos el ciclo pasivo: la
     * Pricelist local estará vacía y solo generaría ruido
     * (o errores) en consola.
     *
     * settingsView.js llama a scheduler.start() la primera
     * vez que se guardan credenciales correctamente, vía el
     * callback onCredentialsSaved → handleCredentialsSaved
     * en app.js (que ya comprueba `!deps.scheduler.started`
     * antes de arrancar).
     */

    const hasCredentials =
        Boolean(tornApiKey) &&
        Boolean(w3bUserId);

    if (hasCredentials) {

        scheduler.start();

    } else {

        console.log(
            "[TornW3B] Sin credenciales guardadas todavía. " +
            "El ciclo pasivo se iniciará al guardar la " +
            "configuración por primera vez."
        );
    }


    /* =====================================================
     * 10. MONTAR INTERFAZ
     * ===================================================== */

    const app =
        createApp({

            pricelist,

            storage,

            scheduler,

            history,

            auditHistory,

            tornAPI,

            w3bAPI,

            priceUpdateService
        });


    /*
     * Referencia global de depuración. Ninguna vista depende
     * de esto: solo ayuda a inspeccionar el estado desde la
     * consola del navegador dentro de TornPDA.
     */

    window.__TW3B__ = {

        app,

        storage,

        scheduler,

        history,

        pricelist
    };


    console.log(
        "[TornW3B] Aplicación iniciada correctamente."
    );
}


/* =============================================================
 * ESPERAR document.body
 * =============================================================
 *
 * El FAB se monta directamente en document.body (app.js). Si
 * el userscript corre con @run-at document-start, body todavía
 * puede no existir en ese momento.
 */

function waitForBody() {

    return new Promise((resolve) => {

        if (document.body) {

            resolve();

            return;
        }

        document.addEventListener(
            "DOMContentLoaded",
            () => resolve(),
            { once: true }
        );
    });
}