

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

    const storage =
        new Storage();

    const config =
        await storage.getConfig();

    const app = buildApp(storage, config);

    app.mount();

    if (!config.tornApiKey || !config.w3bUserId) {

        console.warn(
            "[TornW3B] Faltan credenciales — " +
            "abrí Configuración desde el menú para ingresarlas."
        );

        return;
    }

    const tornAPI =
        new TornAPI(config.tornApiKey);

    const w3bAPI =
        new W3BAPI(config.w3bApiKey);

    const pricelist =
        new Pricelist({ w3bAPI, storage });

    const marketAnalyzer =
        new MarketAnalyzer(CONFIG.SAMPLE_PERCENTAGE);

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
        new History({ tornAPI, storage });

    const scheduler =
        new Scheduler({
            auditor,
            pricelist,
            storage,
            history,
            concurrency: 1
        });

    console.log(
        "[TornW3B] Sistema iniciado"
    );

    try {

        const pricelistItems =
            await pricelist.sync(config.w3bUserId);

        console.log(
            `[TornW3B] Pricelist sincronizada: ${pricelistItems.items.length} items`
        );

    } catch (error) {

        console.error(
            "[TornW3B] Error sincronizando pricelist:",
            error
        );

        console.warn(
            "[TornW3B] Se usará la pricelist cacheada (si existe)."
        );
    }

    await history.init();
    await scheduler.init();

    scheduler.onAuditComplete = (result) => {

        console.log(
            `[TornW3B] Auditoría completa: ${result.itemName} → ${result.status}`
        );

        app.refreshAlertBadge();
    };

    scheduler.onAuditError = (item, error) => {

        console.error(
            `[TornW3B] Error auditando ${item.name}:`,
            error
        );
    };

    scheduler.start();

    Object.assign(app.ctx, {
        tornAPI,
        w3bAPI,
        pricelist,
        marketAnalyzer,
        ratioLearner,
        auditor,
        history,
        scheduler
    });

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
}


function buildApp(storage, config) {

    const ctx = { storage, config };

    const views = {
        search,
        sale: saleView,
        audit: auditView,
        history: historyView,
        settings: settingsView
    };

    return new App(ctx, views);
}


start();