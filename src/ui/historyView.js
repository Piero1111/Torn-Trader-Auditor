import { formatMoney } from "./styles.js";

export const historyView = {

    async render(container, ctx, navigate, params = {}) {

        if (params.itemId) {
            return this.renderDetail(container, ctx, navigate, params.itemId);
        }

        return this.renderRecent(container, ctx, navigate);
    },


    async renderRecent(container, ctx, navigate) {

        container.innerHTML = `<div class="tw3b-skeleton"></div>`;

        const recent = await ctx.history.getRecentlyUpdated(10);

        if (recent.length === 0) {
            container.innerHTML = `
                <div class="tw3b-card-sub">
                    Todavía no hay historial registrado.
                </div>
            `;
            return null;
        }

        const audits = await ctx.storage.getAllAudits();

        container.innerHTML = "";

        for (const entry of recent) {

            const audit = audits[entry.itemId];

            const card = document.createElement("div");
            card.className = "tw3b-card";
            card.innerHTML = `
                <div class="tw3b-card-title">
                    ${escapeHtml(audit?.itemName ?? `Item ${entry.itemId}`)}
                </div>
                <div class="tw3b-card-sub">
                    Última actualización:
                    ${new Date(entry.lastHistoryUpdate).toLocaleDateString()}
                </div>
            `;

            card.addEventListener(
                "click",
                () => navigate("history", { itemId: entry.itemId })
            );

            container.appendChild(card);
        }

        return null;
    },


    async renderDetail(container, ctx, navigate, itemId) {

        container.innerHTML = `
            <div class="tw3b-skeleton"></div>
            <div class="tw3b-skeleton"></div>
        `;

        const [summary, series] = await Promise.all([
            ctx.history.getSummary(itemId),
            ctx.history.getSeries(itemId)
        ]);

        const audit = await ctx.storage.getAudit(itemId);

        if (series.length === 0) {
            container.innerHTML = `
                <div class="tw3b-card-sub">
                    No hay historial para este artículo todavía.
                </div>
            `;
            return null;
        }

        container.innerHTML = `
            <div class="tw3b-card-title">
                ${escapeHtml(audit?.itemName ?? `Item ${itemId}`)}
            </div>

            ${summaryRow("Ayer", summary.yesterday)}
            ${summaryRow("Últimos 7 días", summary.last7d)}
            ${summaryRow("Últimos 30 días", summary.last30d)}
            ${summaryRow("Últimos 6 meses", summary.last6m)}

            <div class="tw3b-card-sub" style="margin-top: 10px;">
                Evolución (Real Market Value)
            </div>
            <div id="tw3b-history-series"></div>
        `;

        const seriesEl = container.querySelector("#tw3b-history-series");

        for (const point of series.slice(-15)) {

            const r = document.createElement("div");
            r.className = "tw3b-row";
            r.innerHTML = `
                <span class="tw3b-row-label">
                    ${new Date(point.timestamp).toLocaleDateString()}
                </span>
                <span>${formatMoney(point.realMarketValue)}</span>
            `;
            seriesEl.appendChild(r);
        }

        return null;
    }
};


function summaryRow(label, data) {

    if (!data) {
        return `
            <div class="tw3b-row">
                <span class="tw3b-row-label">${label}</span>
                <span class="tw3b-card-sub">Sin datos</span>
            </div>
        `;
    }

    return `
        <div class="tw3b-row">
            <span class="tw3b-row-label">${label}</span>
            <span>${formatMoney(data.avgRealMarketValue)} · ${data.samples} muestras</span>
        </div>
    `;
}


function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}