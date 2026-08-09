import { defineConfig } from "vite";

export default defineConfig({
    build: {
        lib: {
            entry: "src/main.js",
            formats: ["iife"],
            name: "TornTraderAuditor",
            fileName: () => "Torn-Trader-Auditor.user.js"
        },

        rollupOptions: {
            output: {
                banner: `// ==UserScript==
// @name         Torn Trader Auditor
// @namespace    ShinNamo
// @version      1.0.0
// @description  Auditor y analizador de precios para Torn
// @author       ShinNamo
// @match        https://www.torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      weav3r.dev
// @connect      api.torn.com
// ==/UserScript==`
            }
        },

        minify: false,
        emptyOutDir: true
    }
});