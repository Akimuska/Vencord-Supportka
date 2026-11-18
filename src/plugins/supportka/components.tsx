/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 akimuska
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Flex } from "@components/Flex";
import type { RenderModalProps, User } from "@vencord/discord-types";
import {
    Modal,
    openModal,
    SelectedGuildStore,
    TextInput,
    useCallback,
    useMemo,
    useState,
    useStateFromStores,
    VoiceStateStore
} from "@webpack/common";
import type { KeyboardEvent } from "react";

import { disconnectFromVoice, sendBoy, sendGirl, sendReject, setServerMute } from "./actions";
import { MuteIcon, PersonIcon, RejectIcon, UnmuteIcon } from "./icons";
import { settings } from "./settings";
import { cl } from "./utils";

function RejectModal({ modalProps, userId }: { modalProps: RenderModalProps; userId: string; }) {
    const [reason, setReason] = useState("");

    const presets = useMemo(
        () => settings.store.rejectPresets.split(";").map(preset => preset.trim()).filter(Boolean),
        [settings.store.rejectPresets]
    );

    const trimmed = reason.trim();

    const onConfirm = useCallback(() => {
        if (!trimmed) return;
        void sendReject(userId, trimmed);
        modalProps.onClose();
    }, [trimmed, userId, modalProps]);

    return (
        <Modal
            {...modalProps}
            title="Не-допуск"
            actions={[
                { text: "Отмена", variant: "secondary", onClick: () => modalProps.onClose() },
                { text: "Отправить", variant: "critical-primary", disabled: !trimmed, onClick: onConfirm }
            ]}
        >
            <h5>Введите причину отказа</h5>
            <TextInput
                value={reason}
                onChange={setReason}
                placeholder="Например: перезаходит в прихожую 3 раз"
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") onConfirm();
                }}
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

function openRejectModal(userId: string) {
    openModal(props => <RejectModal userId={userId} modalProps={props} />);
}

const STYLE_COLUMN = { padding: "4px 0 0" } as const;
const STYLE_FULL_WIDTH = { width: "100%" } as const;
const STYLE_FLEX_1 = { flex: 1 } as const;

export const SupportkaButtons = ErrorBoundary.wrap(
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
                    variant="secondary"
                    size="small"
                    className={cl("btn")}
                    style={STYLE_FULL_WIDTH}
                    onClick={() => voiceState && setServerMute(guildId, user.id, !voiceState.mute)}
                    disabled={!inVoice}
                >
                    {voiceState?.mute ? <UnmuteIcon /> : <MuteIcon />}
                    {voiceState?.mute ? "Размутить" : "Замутить"}
                </Button>
                <Flex gap={6}>
                    <Button
                        variant="secondary"
                        size="small"
                        className={cl("boy", "btn")}
                        style={STYLE_FLEX_1}
                        onClick={() => void sendBoy(user.id)}
                    >
                        <PersonIcon /> Мальчик
                    </Button>
                    <Button
                        variant="secondary"
                        size="small"
                        className={cl("girl", "btn")}
                        style={STYLE_FLEX_1}
                        onClick={() => void sendGirl(user.id)}
                    >
                        <PersonIcon /> Девочка
                    </Button>
                </Flex>
                <Button
                    variant="secondary"
                    size="small"
                    className={cl("reject", "btn")}
                    style={STYLE_FULL_WIDTH}
                    onClick={() => openRejectModal(user.id)}
                >
                    <RejectIcon /> Не-допуск
                </Button>
                <Button
                    variant="secondary"
                    size="small"
                    className={cl("disconnect", "btn")}
                    style={STYLE_FULL_WIDTH}
                    onClick={() => void disconnectFromVoice(guildId, user.id)}
                    disabled={!inVoice}
                >
                    <RejectIcon /> Отключить
                </Button>
            </Flex>
        );
    },
    { noop: true }
);
