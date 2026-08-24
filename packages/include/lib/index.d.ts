import { EntryOptions, EntryTree } from '@cordisjs/plugin-loader';
import { Context, Service } from 'cordis';
export interface PatchOptions {
    id?: string;
    insert?: EntryOptions[];
    name?: string;
    config?: any;
    group?: boolean | null;
    disabled?: boolean | null;
    inject?: any;
    intercept?: any;
    isolate?: any;
    [key: string]: any;
}
export declare namespace Include {
    interface Config {
        path: string;
        initial?: any[];
        patches?: PatchOptions[];
        enableLogs?: boolean;
    }
}
export declare class Include extends EntryTree {
    config: Include.Config;
    static inject: string[];
    filename: string;
    private type?;
    private readonly;
    private content?;
    private data?;
    private writeTask?;
    constructor(ctx: Context, config: Include.Config);
    private checkAccess;
    private read;
    private applyPatches;
    [Service.init](): AsyncGenerator<() => void, void, unknown>;
    stop(): void;
    refresh(): Promise<void>;
    private _writeFile;
    private writeFile;
    write(): void;
}
export default Include;
