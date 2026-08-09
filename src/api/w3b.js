import { CONFIG } from "../config.js";

export class W3BAPI {

    constructor(apiKey = null) {
        this.apiKey = apiKey;
    }

    async getPricelist(userId) {

        const url =
            `${CONFIG.W3B_API_BASE}/pricelist/${encodeURIComponent(userId)}`;

        return new Promise((resolve, reject) => {

            GM_xmlhttpRequest({
                method: "GET",
                url,

                onload: (response) => {

                    if (response.status < 200 || response.status >= 300) {
                        reject(
                            new Error(
                                `W3B API HTTP ${response.status}`
                            )
                        );
                        return;
                    }

                    try {

                        const data =
                            JSON.parse(response.responseText);

                        if (!Array.isArray(data)) {
                            reject(
                                new Error(
                                    "Formato inesperado de pricelist W3B"
                                )
                            );
                            return;
                        }

                        resolve(data);

                    } catch (error) {

                        reject(
                            new Error(
                                `Error parseando respuesta W3B: ${error.message}`
                            )
                        );
                    }
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
                }
            });
        });
    }
}