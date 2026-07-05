import * as libpdfCore from '@libpdf/core';

import { startProcessRuntime } from '@stitch/sandbox';

// To add a new library: import it statically above, then add it to the map below.
startProcessRuntime({ '@libpdf/core': libpdfCore as Record<string, unknown> });
