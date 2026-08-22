import { Message } from 'cordis';
import { ConsoleExporter as Base } from './shared.js';
export * from './shared.js';
export declare class ConsoleExporter extends Base {
    export(message: Message): void;
}
export default ConsoleExporter;
