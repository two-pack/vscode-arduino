/*--------------------------------------------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *-------------------------------------------------------------------------------------------*/

import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as constants from "../common/constants";
import * as platform from "../common/platform";
import * as util from "../common/util";

import { ArduinoApp } from "../arduino/arduino";

export class CompletionProvider implements vscode.CompletionItemProvider {

    private _headerFiles = new Set<string>();

    private _libPaths = new Set<string>();

    private _watcher: vscode.FileSystemWatcher;

    private _cppConfigFile: string;

    constructor(private _arduinoApp: ArduinoApp) {
        if (vscode.workspace && vscode.workspace.rootPath) {
            this._cppConfigFile = path.join(vscode.workspace.rootPath, constants.CPP_CONFIG_FILE);
            this.updateLibList();

            this._watcher = vscode.workspace.createFileSystemWatcher(this._cppConfigFile);
            this._watcher.onDidCreate(() => this.updateLibList());
            this._watcher.onDidChange(() => this.updateLibList());
            this._watcher.onDidDelete(() => this.updateLibList());
        }
    }

    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
        vscode.CompletionItem[] | Thenable<vscode.CompletionItem[]> {
        // Check if we are currently inside an include statement.
        const text = document.lineAt(position.line).text.substr(0, position.character);
        const match = text.match(/^\s*#\s*include\s*(<[^>]*|"[^"]*)$/);

        if (match) {
            const result = [];
            this._headerFiles.forEach((headerFile) => {
                result.push(new vscode.CompletionItem(headerFile, vscode.CompletionItemKind.File));
            });
            return result;
        }
    }

    private updateLibList(): void {
        this._libPaths.clear();
        this._headerFiles.clear();
        this._arduinoApp.getDefaultPackageLibPaths().forEach((defaultPath) => {
            this._libPaths.add(defaultPath);
        });

        if (fs.existsSync(this._cppConfigFile)) {
            const deviceConfig = util.tryParseJSON(fs.readFileSync(this._cppConfigFile, "utf8"));
            if (deviceConfig) {
                if (deviceConfig.sketch) {
                    const appFolder = path.dirname(deviceConfig.sketch);
                    if (util.directoryExistsSync(appFolder)) {
                        this._libPaths.add(path.normalize(appFolder));
                    }
                }
                if (deviceConfig.configurations) {
                    const plat = util.getCppConfigPlatform();
                    deviceConfig.configurations.forEach((configSection) => {
                        if (configSection.name === plat && Array.isArray(configSection.includePath)) {
                            configSection.includePath.forEach((includePath) => {
                                this._libPaths.add(path.normalize(includePath));
                            });
                        }
                    });
                }
            }
        }

        this._libPaths.forEach((includePath) => {
            this.addLibFiles(includePath);
        });
    }

    private addLibFiles(libPath: string): void {
        if (!util.directoryExistsSync(libPath)) {
            return;
        }
        const subItems = fs.readdirSync(libPath);
        subItems.forEach((item) => {
            try {
                const state = fs.statSync(path.join(libPath, item));
                if (state.isFile() && item.endsWith(".h")) {
                    this._headerFiles.add(item);
                } else if (state.isDirectory()) {
                    this.addLibFiles(path.join(libPath, item));
                }
            } catch (ex) {
            }
        });
    }
}