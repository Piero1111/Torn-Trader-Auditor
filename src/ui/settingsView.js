export const settingsView = {

    async render(container, ctx, navigate) {

        const config = await ctx.storage.getConfig();

        container.innerHTML = `
            <div class="tw3b-row-label" style="margin-bottom: 4px;">Torn API Key</div>
            <input type="password" class="tw3b-search" id="tw3b-torn-key"
                value="${config.tornApiKey ?? ""}" placeholder="•••••••••••••••">

            <div class="tw3b-row-label" style="margin: 10px 0 4px;">TornW3B API Key</div>
            <input type="password" class="tw3b-search" id="tw3b-w3b-key"
                value="${config.w3bApiKey ?? ""}" placeholder="•••••••••••••••">

            <div class="tw3b-row-label" style="margin: 10px 0 4px;">TornW3B User ID</div>
            <input type="text" class="tw3b-search" id="tw3b-w3b-userid"
                value="${config.w3bUserId ?? ""}" placeholder="123456">

            <button class="tw3b-button" id="tw3b-save-config" style="margin-top: 6px;">
                Guardar
            </button>

            <div id="tw3b-config-status" style="margin-top: 10px;"></div>
        `;

        const statusEl = container.querySelector("#tw3b-config-status");

        container
            .querySelector("#tw3b-save-config")
            .addEventListener(
                "click",
                () => this.handleSave(container, ctx, statusEl)
            );

        return null;
    },


    async handleSave(container, ctx, statusEl) {

        const tornApiKey =
            container.querySelector("#tw3b-torn-key").value.trim();

        const w3bApiKey =
            container.querySelector("#tw3b-w3b-key").value.trim();

        const w3bUserId =
            container.querySelector("#tw3b-w3b-userid").value.trim();

        if (!tornApiKey || !/^[a-zA-Z0-9]{16}$/.test(tornApiKey)) {
            statusEl.innerHTML = `
                <div class="tw3b-error">
                    Torn API Key con formato inválido (16 caracteres alfanuméricos).
                </div>
            `;
            return;
        }

        if (!w3bUserId || !/^\d+$/.test(w3bUserId)) {
            statusEl.innerHTML = `
                <div class="tw3b-error">
                    TornW3B User ID debe ser numérico.
                </div>
            `;
            return;
        }

        statusEl.innerHTML = `<div class="tw3b-skeleton"></div>`;

        await ctx.storage.saveConfig({
            tornApiKey,
            w3bApiKey: w3bApiKey || null,
            w3bUserId
        });

        statusEl.innerHTML = `
            <div class="tw3b-card-sub">
                ✓ Configuración guardada. Recargá la página para aplicar las nuevas claves.
            </div>
        `;
    }
};