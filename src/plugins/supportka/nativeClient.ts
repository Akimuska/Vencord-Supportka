/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 akimuska
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { relaunch } from "@utils/native";
import type { PluginNative } from "@utils/types";

import type { InstallResult } from "./native";

type SupportkaNative = PluginNative<typeof import("./native")>;

const Native = (VencordNative.pluginHelpers as Record<string, unknown> | undefined)?.supportka as SupportkaNative | undefined;

export { relaunch };

export function canInstallUpdates() {
    return typeof Native?.installUpdate === "function";
}

export async function installUpdate(version: string): Promise<InstallResult> {
    if (!canInstallUpdates()) {
        return { ok: false, error: "Автоустановка недоступна в этой сборке. Скачай ZIP вручную." };
    }

    try {
        return await Native!.installUpdate(version);
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}
