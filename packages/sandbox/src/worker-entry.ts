import { startWorkerRuntime } from './worker-runtime.js';

// Default worker entry: no preloaded modules, relies on dynamic import for libraries.
// For compiled binaries, use a custom worker entry that statically imports libraries
// and passes them to startWorkerRuntime().
startWorkerRuntime();
