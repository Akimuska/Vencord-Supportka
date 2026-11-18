/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 akimuska
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import definePlugin from "@utils/types";

import { SupportkaButtons } from "./components";
import { PLUGIN_VERSION } from "./constants";
import { migrateSettings, settings } from "./settings";
import { startUpdateChecks, stopUpdateChecks, setAutoCheckEnabled } from "./updateChecker";

export default definePlugin({
    name: "supportka",
    description: `Supportka v${PLUGIN_VERSION}: кнопки Мальчик, Девочка и Не-допуск, мьют и отключение от войса.`,
    searchTerms: ["сапортка", "мальчик", "девочка", "не-допуск", "мьют", "войс"],
    tags: ["Voice", "Utility"],
    enabledByDefault: true,
    authors: [{ name: "akimuska", id: 0n }],
    settings,

    start() {
        migrateSettings();
        setAutoCheckEnabled(settings.store.autoUpdateCheck);
        startUpdateChecks();
    },

    stop() {
        stopUpdateChecks();
    },

    patches: [{
        find: '"UserProfilePopout");',
        replacement: {
            match: /userId:\i\.id,guild:\i\}\)(?=])/,
            replace: "$&,$self.SupportkaButtons(arguments[0])"
        }
    }],

    SupportkaButtons
});
