/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 akimuska
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ModalAction, RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, useState } from "@webpack/common";

import { PLUGIN_VERSION, RELEASE_API, RELEASE_PAGE, UPDATE_CHECK_INTERVAL } from "./constants";
import { canInstallUpdates, installUpdate, relaunch } from "./nativeClient";
import { isNewerVersion, openExternal } from "./utils";

interface ReleaseAsset {
    name: string;
    browser_download_url: string;
}

interface Release {
    tag_name?: string;
    html_url?: string;
    draft?: boolean;
    prerelease?: boolean;
    assets?: ReleaseAsset[];
}

export interface UpdateInfo {
    version: string;
    pageUrl: string;
    zipUrl?: string;
}

export type UpdateCheckResult =
    | { status: "update"; info: UpdateInfo; }
    | { status: "latest"; }
    | { status: "permission"; }
    | { status: "error"; };

type PermissionState = "unknown" | "restart" | "denied";

let timer: ReturnType<typeof setInterval> | undefined;
let inFlight: Promise<UpdateCheckResult> | undefined;
let notifiedVersion: string | undefined;
let permissionState: PermissionState = "unknown";
let restartToastShown = false;
let autoCheckEnabled = true;

async function ensurePermission(manual: boolean): Promise<"ok" | "restart" | "denied"> {
    if (permissionState === "restart") return "restart";

    const origin = new URL(RELEASE_API).origin;
    if (await VencordNative.csp.isDomainAllowed(origin, ["connect-src"])) {
        permissionState = "unknown";
        restartToastShown = false;
        return "ok";
    }

    if (permissionState === "denied" && !manual) return "denied";

    const result = await VencordNative.csp.requestAddOverride(origin, ["connect-src"], "Supportka update check");
    if (result === "ok") {
        permissionState = "restart";
        return "restart";
    }

    permissionState = "denied";
    return "denied";
}

function findUpdate(releases: Release[]): UpdateInfo | undefined {
    let best: { version: string; release: Release; } | undefined;

    for (const release of releases) {
        if (release.draft || release.prerelease || !release.tag_name) continue;

        const version = release.tag_name.replace(/^v/, "");
        if (!isNewerVersion(version, PLUGIN_VERSION)) continue;
        if (!best || isNewerVersion(version, best.version)) best = { version, release };
    }

    if (!best) return;

    return {
        version: best.version,
        pageUrl: best.release.html_url || RELEASE_PAGE,
        zipUrl: best.release.assets?.find(asset => asset.name.endsWith(".zip"))?.browser_download_url
    };
}

async function runCheck(manual: boolean): Promise<UpdateCheckResult> {
    try {
        const permission = await ensurePermission(manual);
        if (permission === "restart") {
            if (!restartToastShown) {
                restartToastShown = true;
                showToast({
                    text: "Разрешение выдано. Перезапусти Discord, чтобы включить проверку обновлений.",
                    duration: 12000
                });
            }
            return { status: "permission" };
        }
        if (permission === "denied") {
            if (manual) {
                showToast({
                    text: "Проверка обновлений выключена: Vencord не разрешил доступ к GitHub.",
                    variant: "critical"
                });
            }
            return { status: "permission" };
        }

        const response = await fetch(RELEASE_API, {
            headers: { Accept: "application/vnd.github+json" },
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw new Error(`GitHub API: ${response.status}`);

        const releases = await response.json() as Release[];
        const info = findUpdate(releases);

        if (!info) {
            if (manual) {
                showToast({ text: `Установлена последняя версия: v${PLUGIN_VERSION}`, variant: "success" });
            }
            return { status: "latest" };
        }

        if (manual || info.version !== notifiedVersion) {
            notifiedVersion = info.version;
            openUpdateModal(info);
        }

        return { status: "update", info };
    } catch {
        if (manual) {
            showToast({ text: "Не удалось проверить обновления. Попробуй позже.", variant: "critical" });
        }
        return { status: "error" };
    }
}

export function checkForUpdates({ manual = false }: { manual?: boolean; } = {}) {
    if (inFlight) return inFlight;

    inFlight = runCheck(manual).finally(() => {
        inFlight = undefined;
    });

    return inFlight;
}

export function startUpdateChecks() {
    stopUpdateChecks();
    if (autoCheckEnabled) void checkForUpdates();
    timer = setInterval(() => {
        if (autoCheckEnabled) void checkForUpdates();
    }, UPDATE_CHECK_INTERVAL);
}

export function stopUpdateChecks() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
}

export function setAutoCheckEnabled(enabled: boolean) {
    autoCheckEnabled = enabled;
    if (enabled) void checkForUpdates();
}

type InstallState =
    | { phase: "offer"; }
    | { phase: "installing"; }
    | { phase: "done"; }
    | { phase: "error"; message: string; };

function UpdateModal({ modalProps, info }: { modalProps: RenderModalProps; info: UpdateInfo; }) {
    const [state, setState] = useState<InstallState>({ phase: "offer" });
    const zipUrl = info.zipUrl;

    async function startInstall() {
        setState({ phase: "installing" });

        const result = await installUpdate(info.version);
        if (result.ok) {
            setState({ phase: "done" });
            showToast({
                text: `Supportka v${info.version} установлена. Перезапусти Discord.`,
                variant: "success"
            });
        } else {
            setState({ phase: "error", message: result.error || "Не удалось установить обновление." });
        }
    }

    if (state.phase === "installing") {
        return (
            <Modal
                {...modalProps}
                title={`Обновление Supportka v${info.version}`}
                actions={[
                    { text: "Устанавливаю…", variant: "primary", loading: true, disabled: true, onClick: () => { } }
                ]}
            >
                <p>Скачиваю архив с GitHub и проверяю SHA-256…</p>
                <p>Это может занять несколько секунд. Discord пока не закрывай.</p>
            </Modal>
        );
    }

    if (state.phase === "done") {
        return (
            <Modal
                {...modalProps}
                title="Обновление установлено"
                actions={[
                    { text: "Позже", variant: "secondary", onClick: () => modalProps.onClose() },
                    {
                        text: "Перезапустить Discord",
                        variant: "primary",
                        onClick: () => {
                            modalProps.onClose();
                            relaunch();
                        }
                    }
                ]}
            >
                <p><b>Supportka v{info.version}</b> установлена.</p>
                <p>Перезапусти Discord, чтобы изменения вступили в силу.</p>
            </Modal>
        );
    }

    if (state.phase === "error") {
        const actions: ModalAction[] = [
            { text: "Закрыть", variant: "secondary", onClick: () => modalProps.onClose() }
        ];

        if (zipUrl) {
            actions.push({
                text: "Скачать ZIP",
                variant: "secondary",
                onClick: () => {
                    openExternal(zipUrl);
                    modalProps.onClose();
                }
            });
        }

        actions.push({
            text: "Повторить",
            variant: "primary",
            onClick: () => void startInstall()
        });

        return (
            <Modal {...modalProps} title="Не удалось установить обновление" actions={actions}>
                <p><b>Ошибка:</b> {state.message}</p>
                <p>
                    Можно обновить вручную: скачай ZIP, полностью закрой Discord, распакуй архив и запусти <b>drop-in.bat</b>.
                </p>
            </Modal>
        );
    }

    const actions: ModalAction[] = [
        { text: "Позже", variant: "secondary", onClick: () => modalProps.onClose() }
    ];

    if (zipUrl) {
        actions.push({
            text: "Скачать ZIP",
            variant: "secondary",
            onClick: () => {
                openExternal(zipUrl);
                modalProps.onClose();
            }
        });
    }

    if (canInstallUpdates()) {
        actions.push({
            text: "Установить обновление",
            variant: "primary",
            onClick: () => void startInstall()
        });
    } else {
        actions.push({
            text: "Открыть страницу релиза",
            variant: "primary",
            onClick: () => {
                openExternal(info.pageUrl);
                modalProps.onClose();
            }
        });
    }

    return (
        <Modal {...modalProps} title={`Доступна Supportka v${info.version}`} actions={actions}>
            <p>Установлена версия v{PLUGIN_VERSION}, доступна v{info.version}.</p>
            {canInstallUpdates() ? (
                <p>
                    Обновление скачается с GitHub, SHA-256 будет проверен, файлы заменятся автоматически.
                    После установки нужно перезапустить Discord.
                </p>
            ) : (
                <p>
                    Скачай ZIP, полностью закрой Discord, распакуй архив и запусти <b>drop-in.bat</b>.
                    Затем запусти Discord снова.
                </p>
            )}
        </Modal>
    );
}

export function openUpdateModal(info: UpdateInfo) {
    try {
        openModal(props => <UpdateModal modalProps={props} info={info} />);
    } catch {
        showToast({ text: `Доступна Supportka v${info.version}: ${info.pageUrl}`, duration: 15000 });
    }
}
