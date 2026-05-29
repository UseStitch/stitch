import { startProcessRuntime } from './process-runtime.js';

// Default process entry: no preloaded modules, relies on dynamic import for libraries.
// For compiled binaries, use a custom process entry that statically imports libraries
// and passes them to startProcessRuntime().
startProcessRuntime();
