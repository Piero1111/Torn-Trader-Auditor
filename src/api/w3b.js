import { CONFIG } from "../config.js";

export class W3BAPI {

    constructor(apiKey = null) {

        this.apiKey =
            apiKey;
    }


    /*
     * =========================================================
     * HEADERS
     * =========================================================
     */

    getHeaders() {

        const headers = {};

        if (this.apiKey) {

            headers["Authorization"] =
                `Bearer ${this.apiKey}`;
        }

        return headers;
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

            GM_xmlhttpRequest({

                method: "GET",

                url,

                headers:
                    this.getHeaders(),


                onload: (response) => {

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


    /*
     * =========================================================
     * ACTUALIZAR PRICELIST
     * =========================================================
     *
     * PUT /pricelist/{userId}
     *
     * Nuestro sistema utiliza únicamente:
     *
     * itemID
     * pricingType: "fixed"
     * pricingValue
     *
     * No utilizamos:
     *
     * bulkType
     * bulkValue
     * bulkQuantity
     * inflationProtectionEnabled
     * roundToPlace
     */

    async updatePricelist(userId, items) {

        /*
         * =====================================================
         * VALIDAR USER ID
         * =====================================================
         */

        if (
            userId === null ||
            userId === undefined ||
            String(userId).trim() === ""
        ) {

            throw new Error(
                "W3B User ID es obligatorio."
            );
        }


        /*
         * =====================================================
         * VALIDAR ITEMS
         * =====================================================
         */

        if (
            !Array.isArray(items) ||
            items.length === 0
        ) {

            throw new Error(
                "Debe proporcionarse al menos un artículo para actualizar."
            );
        }


        /*
         * =====================================================
         * NORMALIZAR ITEMS
         * =====================================================
         */

        const normalizedItems =
            items.map(item => {

                if (!item) {

                    throw new Error(
                        "Artículo inválido para actualizar Pricelist W3B."
                    );
                }


                const itemID =
                    Number(item.itemID);


                if (
                    !Number.isInteger(itemID) ||
                    itemID <= 0
                ) {

                    throw new Error(
                        "Item ID inválido para actualizar Pricelist W3B."
                    );
                }


                const pricingType =
                    item.pricingType;


                if (
                    pricingType !== "fixed"
                ) {

                    throw new Error(
                        `Pricing type inválido para el artículo ${itemID}.`
                    );
                }


                const pricingValue =
                    Number(item.pricingValue);


                if (
                    !Number.isFinite(pricingValue) ||
                    pricingValue <= 0
                ) {

                    throw new Error(
                        `Precio inválido para el artículo ${itemID}.`
                    );
                }


                return {

                    itemID,

                    pricingType:
                        "fixed",

                    pricingValue:
                        Math.round(
                            pricingValue
                        )
                };
            });


        /*
         * =====================================================
         * URL
         * =====================================================
         */

        const url =
            `${CONFIG.W3B_API_BASE}/pricelist/${encodeURIComponent(userId)}`;


        /*
         * =====================================================
         * BODY
         * =====================================================
         *
         * Importante:
         *
         * No enviamos campos que nuestro sistema no utiliza.
         *
         * W3B recibe solamente:
         *
         * {
         *     items: [...]
         * }
         */

        const body = {

            items:
                normalizedItems
        };


        /*
         * =====================================================
         * HEADERS
         * =====================================================
         */

        const headers = {

            "Content-Type":
                "application/json"
        };


        /*
         * =====================================================
         * API KEY
         * =====================================================
         */

        if (this.apiKey) {

            headers["X-API-Key"] =
                this.apiKey;
        }


        /*
         * =====================================================
         * REQUEST
         * =====================================================
         */

        return new Promise((resolve, reject) => {

            GM_xmlhttpRequest({

                method: "PUT",

                url,

                headers,

                data:
                    JSON.stringify(body),


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
                                `W3B Pricelist API HTTP ${response.status}`
                            )
                        );

                        return;
                    }


                    /*
                     * =================================================
                     * RESPUESTA
                     * =================================================
                     */

                    if (
                        !response.responseText
                    ) {

                        resolve(null);

                        return;
                    }


                    let data;

                    try {

                        data =
                            JSON.parse(
                                response.responseText
                            );

                    } catch (error) {

                        reject(
                            new Error(
                                `Error parseando respuesta Pricelist W3B: ${error.message}`
                            )
                        );

                        return;
                    }


                    resolve(data);
                },


                onerror: () => {

                    reject(
                        new Error(
                            "No se pudo conectar con W3B Pricelist API"
                        )
                    );
                },


                ontimeout: () => {

                    reject(
                        new Error(
                            "Timeout conectando con W3B Pricelist API"
                        )
                    );
                },


                onabort: () => {

                    reject(
                        new Error(
                            "Solicitud de actualización de Pricelist W3B cancelada"
                        )
                    );
                }
            });
        });
    }


    /*
     * =========================================================
     * MARKETPLACE
     * =========================================================
     */

    async getMarketplace(itemId) {

        if (
            itemId === null ||
            itemId === undefined ||
            String(itemId).trim() === ""
        ) {

            throw new Error(
                "Item ID es obligatorio."
            );
        }


        const url =
            `${CONFIG.W3B_API_BASE}/marketplace/${encodeURIComponent(itemId)}`;


        return new Promise((resolve, reject) => {

            GM_xmlhttpRequest({

                method: "GET",

                url,

                headers:
                    this.getHeaders(),


                onload: (response) => {

                    if (
                        response.status < 200 ||
                        response.status >= 300
                    ) {

                        reject(
                            new Error(
                                `W3B Marketplace API HTTP ${response.status}`
                            )
                        );

                        return;
                    }


                    let data;

                    try {

                        data =
                            JSON.parse(
                                response.responseText
                            );

                    } catch (error) {

                        reject(
                            new Error(
                                `Error parseando respuesta Marketplace W3B: ${error.message}`
                            )
                        );

                        return;
                    }


                    if (
                        !data ||
                        typeof data !== "object" ||
                        !Array.isArray(data.listings)
                    ) {

                        reject(
                            new Error(
                                "Formato inesperado de Marketplace W3B"
                            )
                        );

                        return;
                    }


                    const marketplace = {

                        ...data,

                        item_id:
                            Number(data.item_id),

                        market_price:
                            Number(data.market_price),

                        bazaar_average:
                            Number(data.bazaar_average),

                        generated_at:
                            Number(data.generated_at),

                        listings:
                            data.listings
                                .map(listing => ({

                                    ...listing,

                                    item_id:
                                        Number(
                                            listing.item_id
                                        ),

                                    player_id:
                                        Number(
                                            listing.player_id
                                        ),

                                    quantity:
                                        Number(
                                            listing.quantity
                                        ),

                                    price:
                                        Number(
                                            listing.price
                                        ),

                                    content_updated:
                                        Number(
                                            listing.content_updated
                                        ),

                                    last_checked:
                                        Number(
                                            listing.last_checked
                                        )
                                }))
                                .filter(
                                    listing =>
                                        Number.isFinite(
                                            listing.price
                                        ) &&
                                        Number.isFinite(
                                            listing.quantity
                                        ) &&
                                        listing.quantity > 0
                                )
                    };


                    resolve(
                        marketplace
                    );
                },


                onerror: () => {

                    reject(
                        new Error(
                            "No se pudo conectar con W3B Marketplace API"
                        )
                    );
                },


                ontimeout: () => {

                    reject(
                        new Error(
                            "Timeout conectando con W3B Marketplace API"
                        )
                    );
                },


                onabort: () => {

                    reject(
                        new Error(
                            "Solicitud a W3B Marketplace API cancelada"
                        )
                    );
                }
            });
        });
    }
}