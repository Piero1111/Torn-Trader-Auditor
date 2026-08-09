import { CONFIG } from "../config.js";

export class W3BAPI {

    constructor(apiKey = null) {

        this.apiKey =
            apiKey;
    }


    /*
     * =========================================================
     * PRICELIST
     * =========================================================
     */

    async getPricelist(userId) {

        if (
            userId === null ||
            userId === undefined ||
            String(userId).trim() === ""
        ) {
            throw new Error(
                "W3B User ID es obligatorio."
            );
        }


        const url =
            `${CONFIG.W3B_API_BASE}/pricelist/${encodeURIComponent(userId)}`;


        return new Promise((resolve, reject) => {

            const headers = {};


            /*
             * La API Key es opcional.
             *
             * Si existe, la enviamos.
             *
             * Ajustá el nombre del header si tu API
             * utiliza otro nombre.
             */

            if (this.apiKey) {

                headers["Authorization"] =
                    `Bearer ${this.apiKey}`;
            }


            GM_xmlhttpRequest({

                method: "GET",

                url,

                headers,


                onload: (response) => {

                    /*
                     * =================================================
                     * HTTP
                     * =================================================
                     */

                    if (
                        response.status < 200 ||
                        response.status >= 300
                    ) {

                        reject(
                            new Error(
                                `W3B API HTTP ${response.status}`
                            )
                        );

                        return;
                    }


                    /*
                     * =================================================
                     * JSON
                     * =================================================
                     */

                    let data;

                    try {

                        data =
                            JSON.parse(
                                response.responseText
                            );

                    } catch (error) {

                        reject(
                            new Error(
                                `Error parseando respuesta W3B: ${error.message}`
                            )
                        );

                        return;
                    }


                    /*
                     * =================================================
                     * FORMATO
                     * =================================================
                     *
                     * Actualmente esperamos:
                     *
                     * [
                     *     {
                     *         id,
                     *         name,
                     *         buyPrice,
                     *         ...
                     *     }
                     * ]
                     */

                    if (!Array.isArray(data)) {

                        reject(
                            new Error(
                                "Formato inesperado de pricelist W3B"
                            )
                        );

                        return;
                    }


                    resolve(data);
                },


                onerror: () => {

                    reject(
                        new Error(
                            "No se pudo conectar con W3B API"
                        )
                    );
                },


                ontimeout: () => {

                    reject(
                        new Error(
                            "Timeout conectando con W3B API"
                        )
                    );
                },


                onabort: () => {

                    reject(
                        new Error(
                            "Solicitud a W3B API cancelada"
                        )
                    );
                }
            });
        });
    }
}
