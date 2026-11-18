/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 akimuska
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { OptionType } from "@utils/types";
import { useState } from "@webpack/common";

import {
    DEFAULT_BOY_CHANNEL,
    DEFAULT_GIRL_CHANNEL,
    DEFAULT_REJECT_CHANNEL,
    DEFAULT_REJECT_PRESETS,
    LEGACY_REJECT_PRESETS,
    PLUGIN_VERSION
} from "./constants";
import { checkForUpdates, setAutoCheckEnabled } from "./updateChecker";

function CheckUpdatesButton() {
    const [busy, setBusy] = useState(false);

    return (
        <Button
            size="small"
            disabled={busy}
            onClick={async () => {
                setBusy(true);
                try {
                    await checkForUpdates({ manual: true });
                } finally {
                    setBusy(false);
                }
            }}
        >
            {busy ? "Проверяю…" : "Проверить и установить"}
        </Button>
    );
}

export const settings = definePluginSettings({
    installedVersion: {
        type: OptionType.COMPONENT,
        component: () => <b>Supportka v{PLUGIN_VERSION}</b>
    },
    boyChannelId: {
        type: OptionType.STRING,
        displayName: "Канал «Мальчик»",
        description: "ID канала, куда отправляется запись при нажатии Мальчик.",
        default: DEFAULT_BOY_CHANNEL
    },
    girlChannelId: {
        type: OptionType.STRING,
        displayName: "Канал «Девочка»",
        description: "ID канала, куда отправляется запись при нажатии Девочка.",
        default: DEFAULT_GIRL_CHANNEL
    },
    rejectChannelId: {
        type: OptionType.STRING,
        displayName: "Канал «Не-допуск»",
        description: "ID канала, куда отправляется запись при нажатии Не-допуск.",
        default: DEFAULT_REJECT_CHANNEL
    },
    rejectPresets: {
        type: OptionType.STRING,
        displayName: "Пресеты причин",
        description: "Быстрые причины в окне «Не-допуск», разделяются точкой с запятой.",
        default: DEFAULT_REJECT_PRESETS
    },
    autoUpdateCheck: {
        type: OptionType.BOOLEAN,
        displayName: "Проверять обновления автоматически",
        description: "Проверка при запуске и каждые 4 часа. Ручная кнопка работает всегда.",
        default: true,
        onChange: (value: boolean) => setAutoCheckEnabled(value)
    },
    checkUpdates: {
        type: OptionType.COMPONENT,
        component: CheckUpdatesButton
    }
});

export function migrateSettings() {
    if (LEGACY_REJECT_PRESETS.includes(settings.store.rejectPresets)) {
        settings.store.rejectPresets = DEFAULT_REJECT_PRESETS;
    }
}
