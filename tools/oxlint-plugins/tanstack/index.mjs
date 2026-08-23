import requireQuerySelect from './require-query-select.mjs';

/** @type {{ meta: { name: string }, rules: Record<string, unknown> }} */
const plugin = { meta: { name: '@stitch/query' }, rules: { 'require-query-select': requireQuerySelect } };

export default plugin;
