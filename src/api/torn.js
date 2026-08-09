import { CONFIG } from "../config.js";

export class TornAPI {

    constructor(apiKey) {
        this.apiKey = apiKey;

        /*
         * Todas las peticiones pasan por esta cola.
         *
         * Importante:
         * el retry NO vuelve a entrar en la cola.
         * Se ejecuta dentro de la misma tarea.
         */
        this.requestQueue = Promise.resolve();

        /*
         * Una petición por segundo como máximo.
         *
         * Esto es deliberadamente conservador porque
         * cada auditoría necesita dos endpoints:
         *
         * /torn/{id}/items
         * /market/{id}/itemmarket
         */
        this.minRequestInterval = 1000;

        this.lastRequestTime = 0;

        this.maxRetries = 4;
    }


    sleep(ms) {
        return new Promise(resolve =>
            setTimeout(resolve, ms)
        );
    }


    async waitForRateLimit() {

        const now = Date.now();

        const elapsed =
            now - this.lastRequestTime;

        const remaining =
            this.minRequestInterval - elapsed;

        if (remaining > 0) {
            await this.sleep(remaining);
        }

        this.lastRequestTime = Date.now();
    }


    enqueueRequest(requestFn) {

        const execute =
            this.requestQueue.then(requestFn);

        /*
         * La cola continúa aunque una petición falle.
         */
        this.requestQueue =
            execute.catch(() => {});

        return execute;
    }


    async request(path) {

        return this.enqueueRequest(async () => {

            let lastError = null;

            for (
                let retry = 0;
                retry <= this.maxRetries;
                retry++
            ) {

                await this.waitForRateLimit();

                try {

                    const data =
                        await this.performRequest(path);

                    return data;

                } catch (error) {

                    lastError = error;

                    /*
                     * Solo reintentamos rate limits.
                     */
                    if (
                        error?.code !== "RATE_LIMIT"
                    ) {
                        throw error;
                    }


                    if (retry >= this.maxRetries) {
                        throw new Error(
                            "Too many requests"
                        );
                    }


                    const delay =
                        1000 * Math.pow(2, retry);

                    console.warn(
                        `[TornAPI] Rate limit. ` +
                        `Reintentando en ${delay}ms ` +
                        `(intento ${retry + 1}/${this.maxRetries})`
                    );

                    await this.sleep(delay);
                }
            }

            throw lastError ||
                new Error("Torn API error");
        });
    }


    performRequest(path) {

        const separator =
            path.includes("?") ? "&" : "?";

        const url =
            `${CONFIG.TORN_API_BASE}${path}` +
            `${separator}key=${encodeURIComponent(this.apiKey)}`;


        return new Promise((resolve, reject) => {

            GM_xmlhttpRequest({

                method: "GET",

                url,

                timeout: 30000,


                onload: (response) => {

                    let data = null;

                    try {

                        data =
                            JSON.parse(
                                response.responseText
                            );

                    } catch {

                        reject(
                            new Error(
                                "Respuesta inválida de Torn API"
                            )
                        );

                        return;
                    }


                    /*
                     * Rate limit.
                     */
                    if (
                        data?.error?.error ===
                        "Too many requests"
                    ) {

                        const error =
                            new Error(
                                "Too many requests"
                            );

                        error.code =
                            "RATE_LIMIT";

                        reject(error);

                        return;
                    }


                    /*
                     * Otros errores HTTP.
                     */
                    if (
                        response.status < 200 ||
                        response.status >= 300
                    ) {

                        reject(
                            new Error(
                                `Torn API HTTP ${response.status}`
                            )
                        );

                        return;
                    }


                    /*
                     * Error devuelto por Torn.
                     */
                    if (data?.error) {

                        const error =
                            new Error(
                                data.error.error ||
                                "Torn API error"
                            );

                        /*
                         * Marcamos específicamente
                         * los errores que son permanentes.
                         */
                        if (
                            data.error.error ===
                            "Incorrect ID"
                        ) {
                            error.code = "INVALID_ID";
                        }

                        reject(error);

                        return;
                    }


                    resolve(data);
                },


                onerror: () => {

                    reject(
                        new Error(
                            "No se pudo conectar con Torn API"
                        )
                    );
                },


                ontimeout: () => {

                    reject(
                        new Error(
                            "Timeout conectando con Torn API"
                        )
                    );
                }

            });
        });
    }


    async getItem(itemId) {

        return this.request(
            `/torn/${itemId}/items`
        );
    }


    async getItemMarket(itemId) {

        return this.request(
            `/market/${itemId}/itemmarket`
        );
    }


    async getTimestamp() {

        return this.request(
            `/market/timestamp`
        );
    }
}