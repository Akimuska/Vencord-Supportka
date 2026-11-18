/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 akimuska
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const PLUGIN_VERSION = "1.2.6";

export const RELEASE_API = "https://api.github.com/repos/Akimuska/Vencord-Supportka/releases?per_page=20";
export const RELEASE_PAGE = "https://github.com/Akimuska/Vencord-Supportka/releases/latest";

/** How often to check for a new release while Discord is running. */
export const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000;

export const DEFAULT_BOY_CHANNEL = "852418390618275891";
export const DEFAULT_GIRL_CHANNEL = "853603250443780116";
export const DEFAULT_REJECT_CHANNEL = "852418435031498752";

export const DEFAULT_REJECT_PRESETS = "Молчит в войсе, в лс отписано; АртёмВавилов; ;Оскорбляет";

export const LEGACY_REJECT_PRESETS = [
    "АртёмВавилов;Запрещённая символика;Пропаганда наркотиков;Оскорбления;Ссылки без спойлера;Перезаходит в прихожую;Возраст",
    "Молчит в войсе, в лс отписано;АртёмВавилов;12 лет, ;Оскорбляет"
];
