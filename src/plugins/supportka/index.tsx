/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 akimuska
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Flex } from "@components/Flex";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { RenderModalProps, User } from "@vencord/discord-types";
import { Forms, Modal, openModal, RestAPI, SelectedGuildStore, showToast, TextInput, Toasts, useCallback, useMemo, UserStore, useState, useStateFromStores, VoiceStateStore } from "@webpack/common";
import { KeyboardEvent } from "react";

// --- Hardcoded channel IDs (Lounge server) ---
const DEFAULT_BOY_CHANNEL    = "852418390618275891";
const DEFAULT_GIRL_CHANNEL   = "853603250443780116";
const DEFAULT_REJECT_CHANNEL = "852418435031498752";
const DEFAULT_RELAY_GUILD_ID = "1535963962053632120";

const OLD_REJECT_PRESETS     = "АртёмВавилов;Запрещённая символика;Пропаганда наркотиков;Оскорбления;Ссылки без спойлера;Перезаходит в прихожую;Возраст";
const DEFAULT_REJECT_PRESETS = "Молчит в войсе, в лс отписано;АртёмВавилов;12 лет, ;Оскорбляет";

const CHANNEL_CACHE_KEY = "vc-supportka-channels";

const cl = classNameFactory("vc-supportka-");

// --- Settings ---
const settings = definePluginSettings({
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
        displayName: "Канал «Отказ»",
        description: "ID канала, куда отправляется запись при нажатии Отказ.",
        default: DEFAULT_REJECT_CHANNEL
    },
    rejectPresets: {
        type: OptionType.STRING,
        displayName: "Пресеты причин отказа",
        description: "Быстрые причины в окне «Отказ», разделяются точкой с запятой.",
        default: DEFAULT_REJECT_PRESETS
    }
});

// --- Helpers ---
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function setServerMute(guildId: string, userId: string, mute: boolean) {
    if (userId === UserStore.getCurrentUser().id) {
        showToast("Нельзя замьютить/размьютить самого себя", Toasts.Type.FAILURE);
        return;
    }
    RestAPI.patch({
        url: `/guilds/${guildId}/members/${userId}`,
        body: { mute }
    })
        .then(() => showToast(mute ? "Пользователь замьючен" : "Пользователь размьючен", Toasts.Type.SUCCESS))
        .catch(err => showToast(
            `Не удалось изменить мьют (${err?.response?.status ?? err?.message ?? "нет прав"})`,
            Toasts.Type.FAILURE
        ));
}

async function sendRawMessage(channelId: string, content: string) {
    await RestAPI.post({ url: `/channels/${channelId}/messages`, body: { content } });
}

type TargetChannel = "boy" | "girl" | "reject";

const CHANNEL_NAMES: Record<TargetChannel, string> = {
    boy: "мальчик",
    girl: "девочка",
    reject: "отказ"
};

function configuredChannelId(type: TargetChannel): string {
    switch (type) {
        case "boy":    return settings.store.boyChannelId;
        case "girl":   return settings.store.girlChannelId;
        case "reject": return settings.store.rejectChannelId;
    }
}

async function resolveTargetChannel(type: TargetChannel): Promise<string | null> {
    const cache = (await DataStore.get<Record<string, string>>(CHANNEL_CACHE_KEY)) ?? {};
    if (cache[type]) return cache[type];

    const configured = configuredChannelId(type);
    try {
        await RestAPI.get({ url: `/channels/${configured}` });
        return configured;
    } catch { /* канала нет или нет доступа — пробуем создать */ }

    try {
        const { body } = await RestAPI.post({
            url: `/guilds/${DEFAULT_RELAY_GUILD_ID}/channels`,
            body: { name: CHANNEL_NAMES[type], type: 0 }
        });
        cache[type] = body.id;
        await DataStore.set(CHANNEL_CACHE_KEY, cache);
        showToast(`Сапортка: канал «${CHANNEL_NAMES[type]}» создан автоматически`, Toasts.Type.SUCCESS);
        return body.id;
    } catch {
        return null;
    }
}

async function sendBoy(userId: string) {
    const channel = await resolveTargetChannel("boy");
    if (!channel) {
        showToast("Сапортка: канал «мальчик» недоступен (нет прав?)", Toasts.Type.FAILURE);
        return;
    }
    await sendRawMessage(channel, userId);
    showToast("Отправлено: Мальчик", Toasts.Type.SUCCESS);
}

async function sendGirl(userId: string) {
    const girlChannel = await resolveTargetChannel("girl");
    const boyChannel  = await resolveTargetChannel("boy");
    if (!girlChannel || !boyChannel) {
        showToast("Сапортка: каналы «девочка»/«мальчик» недоступны", Toasts.Type.FAILURE);
        return;
    }
    await sendRawMessage(girlChannel, userId);
    await wait(250);
    await sendRawMessage(boyChannel, userId);
    showToast("Отправлено: Девочка", Toasts.Type.SUCCESS);
}

async function sendReject(userId: string, reason: string) {
    const channel = await resolveTargetChannel("reject");
    if (!channel) {
        showToast("Сапортка: канал «отказ» недоступен (нет прав?)", Toasts.Type.FAILURE);
        return;
    }
    await sendRawMessage(channel, `${userId} ${reason}`);
    showToast("Отправлено: Отказ", Toasts.Type.SUCCESS);
}

// --- SVG icons ---
const svgProps = {
    width: 16, height: 16, viewBox: "0 0 24 24",
    fill: "currentColor", "aria-hidden": true
} as const;

const MuteIcon = () => (
    <svg {...svgProps}>
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
);

const UnmuteIcon = () => (
    <svg {...svgProps}>
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
    </svg>
);

const PersonIcon = () => (
    <svg {...svgProps}>
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
);

const RejectIcon = () => (
    <svg {...svgProps}>
        <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
);

// --- Reject modal ---
function openRejectModal(userId: string, guildId: string) {
    openModal(props => <RejectModal userId={userId} guildId={guildId} modalProps={props} />);
}

function RejectModal({ modalProps, userId, guildId }: {
    modalProps: RenderModalProps;
    userId: string;
    guildId: string;
}) {
    const [reason, setReason] = useState("");

    const presets = useMemo(() =>
        settings.store.rejectPresets.split(";").map(p => p.trim()).filter(Boolean),
        [settings.store.rejectPresets]
    );

    const trimmed = reason.trim();

    const onConfirm = useCallback(() => {
        if (!trimmed) return;
        void sendReject(userId, trimmed);
        modalProps.onClose();
    }, [trimmed, userId, guildId, modalProps]);

    return (
        <Modal
            {...modalProps}
            title="Отказ"
            actions={[
                { text: "Отмена", variant: "secondary", onClick: () => modalProps.onClose() },
                { text: "Отправить", variant: "critical-primary", disabled: !trimmed, onClick: onConfirm }
            ]}
        >
            <Forms.FormTitle tag="h5">Введите причину отказа</Forms.FormTitle>
            <TextInput
                value={reason}
                onChange={setReason}
                placeholder="Например: перезаходит в прихожую 3 раз"
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") onConfirm(); }}
            />
            {presets.length > 0 && (
                <div className={cl("presets")}>
                    {presets.map(preset => (
                        <Button key={preset} variant="secondary" size="min" onClick={() => setReason(preset)}>
                            {preset}
                        </Button>
                    ))}
                </div>
            )}
        </Modal>
    );
}

// --- Main buttons component ---
const STYLE_COLUMN     = { padding: "4px 0 0" } as const;
const STYLE_FULL_WIDTH = { width: "100%" } as const;
const STYLE_FLEX_1     = { flex: 1 } as const;

const SupportkaButtons = ErrorBoundary.wrap(
    (props: { user?: User; guildId?: string; }) => {
        const { user } = props;
        if (!user?.id) return null;

        const selectedGuildId = useStateFromStores([SelectedGuildStore], () => SelectedGuildStore.getGuildId());

        const voiceState = useStateFromStores(
            [VoiceStateStore],
            () => {
                const guild = props.guildId ?? selectedGuildId;
                return guild
                    ? VoiceStateStore.getVoiceState(guild, user.id)
                    : VoiceStateStore.getVoiceStateForUser(user.id);
            },
            [props.guildId, selectedGuildId, user.id]
        );

        const guildId = props.guildId ?? voiceState?.guildId ?? selectedGuildId;
        if (!guildId) return null;

        const inVoice = Boolean(voiceState?.channelId);

        return (
            <Flex flexDirection="column" gap={6} style={STYLE_COLUMN}>
                <Button
                    variant="secondary" size="small"
                    className={cl("btn")} style={STYLE_FULL_WIDTH}
                    onClick={() => voiceState && setServerMute(guildId, user.id, !voiceState.mute)}
                    disabled={!inVoice}
                >
                    {voiceState?.mute ? <UnmuteIcon /> : <MuteIcon />}
                    {voiceState?.mute ? "Размутить" : "Замутить"}
                </Button>
                <Flex gap={6}>
                    <Button
                        variant="secondary" size="small"
                        className={cl("boy", "btn")} style={STYLE_FLEX_1}
                        onClick={() => void sendBoy(user.id)}
                    >
                        <PersonIcon /> Мальчик
                    </Button>
                    <Button
                        variant="secondary" size="small"
                        className={cl("girl", "btn")} style={STYLE_FLEX_1}
                        onClick={() => void sendGirl(user.id)}
                    >
                        <PersonIcon /> Девочка
                    </Button>
                </Flex>
                <Button
                    variant="secondary" size="small"
                    className={cl("reject", "btn")} style={STYLE_FULL_WIDTH}
                    onClick={() => openRejectModal(user.id, guildId)}
                >
                    <RejectIcon /> Отказ
                </Button>
            </Flex>
        );
    },
    { noop: true }
);

// --- Plugin definition ---
export default definePlugin({
    name: "supportka",
    description: "Кнопки Мальчик/Девочка/Отказ и мьют прямо из профиля пользователя.",
    searchTerms: ["сапортка", "мальчик", "девочка", "отказ", "мьют"],
    tags: ["Voice", "Utility"],
    enabledByDefault: true,
    authors: [{ name: "akimuska" }],
    settings,

    start() {
        if (settings.store.rejectPresets === OLD_REJECT_PRESETS) {
            settings.store.rejectPresets = DEFAULT_REJECT_PRESETS;
        }
    },

    patches: [
        {
            find: '"UserProfilePopout");',
            replacement: {
                match: /userId:\i\.id,guild:\i\}\)(?=])/,
                replace: "$&,$self.SupportkaButtons(arguments[0])"
            }
        }
    ],

    SupportkaButtons
});
