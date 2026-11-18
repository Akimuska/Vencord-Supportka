/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 akimuska
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI, showToast, UserStore } from "@webpack/common";

import { settings } from "./settings";

async function sendMessage(channelId: string, content: string) {
    await RestAPI.post({ url: `/channels/${channelId}/messages`, body: { content } });
}

export function setServerMute(guildId: string, userId: string, mute: boolean) {
    if (userId === UserStore.getCurrentUser().id) {
        showToast({ text: "Нельзя замьютить/размьютить самого себя", variant: "critical" });
        return;
    }

    RestAPI.patch({
        url: `/guilds/${guildId}/members/${userId}`,
        body: { mute }
    })
        .then(() => showToast({ text: mute ? "Пользователь замьючен" : "Пользователь размьючен", variant: "success" }))
        .catch(err => showToast({
            text: `Не удалось изменить мьют (${err?.response?.status ?? err?.message ?? "нет прав"})`,
            variant: "critical"
        }));
}

export async function disconnectFromVoice(guildId: string, userId: string) {
    try {
        await RestAPI.patch({
            url: `/guilds/${guildId}/members/${userId}`,
            body: { channel_id: null }
        });
        showToast({ text: "Пользователь отключён от голосового канала", variant: "success" });
    } catch (err: any) {
        showToast({
            text: `Не удалось отключить пользователя (${err?.response?.status ?? err?.message ?? "нет прав"})`,
            variant: "critical"
        });
    }
}

export async function sendBoy(userId: string) {
    showToast({ text: "Отправляю: Мальчик…" });
    try {
        await sendMessage(settings.store.boyChannelId, userId);
        showToast({ text: "Отправлено: Мальчик", variant: "success" });
    } catch {
        showToast({ text: "Сапортка: канал «Мальчик» недоступен (нет прав?)", variant: "critical" });
    }
}

export async function sendGirl(userId: string) {
    showToast({ text: "Отправляю: Девочка…" });
    try {
        await sendMessage(settings.store.girlChannelId, userId);
    } catch {
        showToast({ text: "Сапортка: канал «Девочка» недоступен (нет прав?)", variant: "critical" });
        return;
    }

    try {
        await sendMessage(settings.store.boyChannelId, userId);
        showToast({ text: "Отправлено: Девочка", variant: "success" });
    } catch {
        showToast({ text: "«Девочка» отправлена, но канал «Мальчик» недоступен", variant: "critical" });
    }
}

export async function sendReject(userId: string, reason: string) {
    showToast({ text: "Отправляю: Не-допуск…" });
    try {
        await sendMessage(settings.store.rejectChannelId, `${userId} ${reason}`);
        showToast({ text: "Отправлено: Не-допуск", variant: "success" });
    } catch {
        showToast({ text: "Сапортка: канал «Не-допуск» недоступен (нет прав?)", variant: "critical" });
    }
}
