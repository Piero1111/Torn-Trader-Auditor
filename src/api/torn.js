
import { CONFIG } from "../config.js";


export class TornAPI {

    constructor(apiKey) {

        this.apiKey = apiKey;

        /*
         * Cola global de solicitudes.
         *
         * TODAS las peticiones pasan por aquí.
         */
        this.requestQueue =
            Promise.resolve();


        /*
         * Intervalo mínimo entre peticiones.
         *
         * 1000 ms = máximo aproximado
         * de 1 petición por segundo.
         */
        this.minRequestInterval =
            1000;


        this.lastRequestTime =
            0;


        /*
         * Máximo de reintentos para
         * rate limit.
         */
        this.maxRetries =
            4;
    }


    /* =========================================================
     * UTILIDADES
     * ========================================================= */

    sleep(ms) {

        return new Promise(resolve =>
            setTimeout(resolve, ms)
        );
    }


    async waitForRateLimit() {

        const now =
            Date.now();

        const elapsed =
            now - this.lastRequestTime;

        const remaining =
            this.minRequestInterval -
            elapsed;


        if (remaining > 0) {

            await this.sleep(
                remaining
            );
        }


        /*
         * Registramos el momento en que
         * vamos a realizar la petición.
         */
        this.lastRequestTime =
            Date.now();
    }


    /* =========================================================
     * COLA GLOBAL
     * ========================================================= */

    enqueueRequest(requestFn) {

        const execute =
            this.requestQueue.then(
                requestFn
            );


        /*
         * La cola debe continuar aunque
         * esta solicitud falle.
         */
        this.requestQueue =
            execute.catch(() => {});


        return execute;
    }


    /* =========================================================
     * REQUEST
     * ========================================================= */

    async request(path) {

        return this.enqueueRequest(
            async () => {

                let lastError =
                    null;


                for (
                    let retry = 0;
                    retry <= this.maxRetries;
                    retry++
                ) {

                    /*
                     * Esperar el intervalo normal
                     * antes de CADA petición real.
                     */
                    await this.waitForRateLimit();


                    try {

                        return await this.performRequest(
                            path
                        );

                    } catch (error) {

                        lastError =
                            error;


                        /*
                         * Solo hacemos retry
                         * si Torn indica rate limit.
                         */
                        if (
                            error?.code !==
                            "RATE_LIMIT"
                        ) {

                            throw error;
                        }


                        if (
                            retry >=
                            this.maxRetries
                        ) {

                            throw new Error(
                                "Too many requests"
                            );
                        }


                        /*
                         * Backoff progresivo.
                         *
                         * 1s
                         * 2s
                         * 4s
                         * 8s
                         */
                        const delay =
                            1000 *
                            Math.pow(
                                2,
                                retry
                            );


                        console.warn(
                            `[TornAPI] Rate limit. ` +
                            `Reintentando en ${delay}ms ` +
                            `(intento ${retry + 1}/${this.maxRetries})`
                        );


                        await this.sleep(
                            delay
                        );
                    }
                }


                throw (
                    lastError ||
                    new Error(
                        "Torn API error"
                    )
                );
            }
        );
    }


    /* =========================================================
     * PETICIÓN REAL
     * ========================================================= */

    performRequest(path) {

        const separator =
            path.includes("?")
                ? "&"
                : "?";


        const url =
            `${CONFIG.TORN_API_BASE}${path}` +
            `${separator}key=` +
            encodeURIComponent(
                this.apiKey
            );


        return new Promise(
            (resolve, reject) => {

                GM_xmlhttpRequest({

                    method: "GET",

                    url,

                    timeout: 30000,


                    onload: (response) => {

    console.log("[TornAPI] Status:", response.status);
    console.log("[TornAPI] Headers:", response.responseHeaders);
    console.log("[TornAPI] Body:", response.responseText);

    let data = null;

    try {

        data = JSON.parse(response.responseText);

    } catch (error) {

        console.error(
            "[TornAPI] JSON parse error:",
            error
        );

        reject(
            new Error(
                `Respuesta inválida de Torn API | HTTP ${response.status} | ` +
                `Body: ${response.responseText?.slice(0, 200)}`
            )
        );

        return;
    }

    // ... resto igual


                        /* -----------------------------------------
                         * RATE LIMIT
                         * ----------------------------------------- */

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


                            reject(
                                error
                            );

                            return;
                        }


                        /* -----------------------------------------
                         * HTTP ERROR
                         * ----------------------------------------- */

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


                        /* -----------------------------------------
                         * TORN API ERROR
                         * ----------------------------------------- */

                        if (
                            data?.error
                        ) {

                            const error =
                                new Error(
                                    data.error.error ||
                                    "Torn API error"
                                );


                            /*
                             * ID inexistente.
                             */
                            if (
                                data.error.error ===
                                "Incorrect ID"
                            ) {

                                error.code =
                                    "INVALID_ID";
                            }


                            reject(
                                error
                            );

                            return;
                        }


                        /* -----------------------------------------
                         * SUCCESS
                         * ----------------------------------------- */

                        resolve(
                            data
                        );
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
            }
        );
    }


    /* =========================================================
     * ENDPOINTS
     * ========================================================= */

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

