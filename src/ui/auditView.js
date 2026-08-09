import { formatMoney, formatPercent, statusBadgeClass } from "./styles.js";

export const auditView = {

    async render(container, ctx, navigate, params = {}) {

        if (params.itemId) {
            return this.renderDetail(container, ctx, navigate, params.itemId);
        }

        return this.renderList(container, ctx, navigate);
    },


    async renderList(container, ctx, navigate) {

        container.innerHTML = `
            <input type="text" class="tw3b-search" id="tw3b-audit-filter"
                placeholder="🔎 Filtrar por nombre...">
            <div id="tw3b-audit-list">
                <div class="tw3b-skeleton"></div>
                <div class="tw3b-skeleton"></div>
            </div>
        `;

        const audits = await ctx.storage.getAllAudits();

        const order = { RED: 0, YELLOW: 1, GREEN: 2 };

        const list = Object.values(audits).sort(
            (a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3)
        );

        const listEl = container.querySelector("#tw3b-audit-list");

        const renderItems = (filterText = "") => {

            const filtered = filterText
                ? list.filter(a =>
                    a.itemName.toLowerCase().includes(filterText.toLowerCase())
                  )
                : list;

            if (filtered.length === 0) {
                listEl.innerHTML = `
                    <div class="tw3b-card-sub">
                        No hay artículos auditados todavía.
                    </div>
                `;
                return;
            }

            listEl.innerHTML = "";

            for (const audit of filtered) {

                const card = document.createElement("div");
                card.className = "tw3b-card";
                card.innerHTML = `
                    <div class="tw3b-card-title">
                        ${escapeHtml(audit.itemName)}
                        <span class="${statusBadgeClass(audit.status)}">
                            ${audit.status}
                        </span>
                    </div>
                    <div class="tw3b-card-sub">
                        ${formatMoney(audit.w3bBuyPrice)} → ${formatMoney(audit.correctBuyPrice)}
                        · confianza ${audit.confidence}%
                    </div>
                `;

                card.addEventListener(
                    "click",
                    () => navigate("audit", { itemId: audit.itemId })
                );

                listEl.appendChild(card);
            }
        };

        renderItems();

        container
            .querySelector("#tw3b-audit-filter")
            .addEventListener(
                "input",
                (e) => renderItems(e.target.value)
            );

        return null;
    },


    async renderDetail(container, ctx, navigate, itemId) {

        container.innerHTML = `
            <div class="tw3b-skeleton"></div>
            <div class="tw3b-skeleton"></div>
        `;

        const audit = await ctx.storage.getAudit(itemId);

        if (!audit) {
            container.innerHTML = `
                <div class="tw3b-error">
                    No hay datos de auditoría para este artículo.
                </div>
            `;
            return null;
        }

        container.innerHTML = `
            <div class="tw3b-card-title">${escapeHtml(audit.itemName)}</div>

            ${row("Item Value", formatMoney(audit.itemValue))}
            ${row("W3B Buy", formatMoney(audit.w3bBuyPrice))}
            ${row("Observed W3B", formatPercent(audit.observedRatio))}
            ${row("Learned W3B", formatPercent(audit.learnedRatio))}
            ${row("Market Units", audit.totalMarketQuantity)}
            ${row("Sample", audit.sampleQuantity)}
            ${row("Weighted Mean", formatMoney(audit.weightedMean))}
            ${row("Weighted Median", formatMoney(audit.weightedMedian))}
            ${row("Real Market Value", formatMoney(audit.realMarketValue))}
            ${row("Correct Buy", formatMoney(audit.correctBuyPrice))}
            ${row("Difference", formatPercent(audit.differencePercent))}
            ${row("Confidence", audit.confidence + "%")}
            ${row("Status", `<span class="${statusBadgeClass(audit.status)}">${audit.status}</span>`)}

            <button class="tw3b-button" id="tw3b-view-history" style="margin-top: 10px;">
                Ver historial
            </button>
        `;

        container
            .querySelector("#tw3b-view-history")
            .addEventListener(
                "click",
                () => navigate("history", { itemId: audit.itemId })
            );

        return null;
    }
};


function row(label, value) {
    return `
        <div class="tw3b-row">
            <span class="tw3b-row-label">${label}</span>
            <span>${value}</span>
        </div>
    `;
}


function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}