/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 akimuska
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DATA_DIR } from "@main/utils/constants";
import type { IpcMainInvokeEvent } from "electron";
import { net } from "electron";
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "Akimuska/Vencord-Supportka";
const REQUIRED_FILES = ["renderer.js", "renderer.css", "preload.js", "patcher.js"];
const MAX_ARCHIVE_SIZE = 20 * 1024 * 1024;

interface ReleaseAsset {
    name: string;
    browser_download_url: string;
    digest?: string;
}

interface Release {
    tag_name?: string;
    draft?: boolean;
    prerelease?: boolean;
    assets?: ReleaseAsset[];
}

export interface InstallResult {
    ok: boolean;
    version?: string;
    error?: string;
}

async function getReleaseAsset(version: string) {
    const response = await net.fetch(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Supportka"
        },
        signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) throw new Error(`GitHub API: HTTP ${response.status}`);

    const release = await response.json() as Release;
    if (release.draft || release.prerelease) throw new Error("Релиз ещё не опубликован.");
    if (release.tag_name !== `v${version}`) throw new Error("Тег релиза не совпадает.");

    const asset = release.assets?.find(asset => asset.name === `supportka-v${version}.zip`);
    if (!asset) throw new Error("В релизе нет ZIP-архива.");

    const digest = asset.digest?.replace(/^sha256:/i, "").toLowerCase();
    if (!digest || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("У релиза нет SHA-256.");

    const expectedUrl = `https://github.com/${REPO}/releases/download/v${version}/supportka-v${version}.zip`;
    if (asset.browser_download_url !== expectedUrl) throw new Error("Неожиданная ссылка на архив.");

    return { url: asset.browser_download_url, digest };
}

async function copyWithRetry(source: string, target: string) {
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            copyFileSync(source, target);
            return;
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    throw lastError;
}

export async function installUpdate(_: IpcMainInvokeEvent, version: string): Promise<InstallResult> {
    try {
        if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Некорректная версия.");

        const { url, digest } = await getReleaseAsset(version);

        const response = await net.fetch(url, {
            signal: AbortSignal.timeout(120_000)
        });
        if (!response.ok) throw new Error(`Скачивание: HTTP ${response.status}`);

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_ARCHIVE_SIZE) throw new Error("Архив слишком большой.");

        const actual = createHash("sha256").update(buffer).digest("hex");
        if (actual !== digest) throw new Error("SHA-256 не совпал, установка отменена.");

        const files = unzipSync(new Uint8Array(buffer));
        const entries = new Map<string, Uint8Array>();
        let root: string | undefined;

        for (const [name, data] of Object.entries(files)) {
            // Windows zip tools may store backslashes instead of forward slashes.
            const normalized = name.replace(/\\/g, "/");
            const match = /^([^/]+)\/Vencord\/dist\/([^/]+)$/.exec(normalized);
            if (!match) continue;
            if (root !== undefined && root !== match[1]) throw new Error("Неожиданная структура архива.");
            root = match[1];
            entries.set(match[2], data);
        }

        if (root !== `supportka-v${version}`) throw new Error("Версия в архиве не совпадает.");

        for (const file of REQUIRED_FILES) {
            if (!entries.has(file)) throw new Error(`В архиве нет ${file}.`);
        }

        const renderer = Buffer.from(entries.get("renderer.js")!).toString("utf8");
        if (!renderer.includes("vc-supportka") || !renderer.includes(version)) {
            throw new Error("В архиве нет нужной сборки Supportka.");
        }

        const distDir = join(DATA_DIR, "dist");
        if (!existsSync(join(distDir, "renderer.js"))) throw new Error("Папка Vencord dist не найдена.");

        const backupDir = join(DATA_DIR, "dist.supportka-previous");
        rmSync(backupDir, { recursive: true, force: true });
        mkdirSync(backupDir, { recursive: true });

        for (const file of REQUIRED_FILES) {
            const target = join(distDir, file);
            if (existsSync(target)) copyFileSync(target, join(backupDir, file));
        }

        try {
            for (const file of REQUIRED_FILES) {
                const target = join(distDir, file);
                const temp = `${target}.supportka-new`;
                writeFileSync(temp, entries.get(file)!);
                await copyWithRetry(temp, target);
                rmSync(temp, { force: true });
            }

            const installed = readFileSync(join(distDir, "renderer.js"), "utf8");
            if (!installed.includes("vc-supportka") || !installed.includes(version)) {
                throw new Error("Проверка установленной сборки не прошла.");
            }
        } catch (error) {
            for (const file of REQUIRED_FILES) {
                rmSync(join(distDir, `${file}.supportka-new`), { force: true });
                const backup = join(backupDir, file);
                if (existsSync(backup)) {
                    try {
                        copyFileSync(backup, join(distDir, file));
                    } catch { /* keep the original error */ }
                }
            }
            throw error;
        }

        return { ok: true, version };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}
