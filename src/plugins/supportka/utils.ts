/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 akimuska
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";

export const cl = classNameFactory("vc-supportka-");

export function isNewerVersion(candidate: string, current: string) {
    return candidate.localeCompare(current, undefined, { numeric: true }) > 0;
}

export function openExternal(url: string) {
    try {
        VencordNative.native.openExternal(url);
    } catch {
        // The browser build has no native shell; ignore.
    }
}
