import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', 'src/data/', 'src/vendor/'] },
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, THREE: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }], 'no-redeclare': 'error', 'no-import-assign': 'error' },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser, OrbitalSim: 'readonly' } },
    rules: { 'no-undef': 'error' },
  },
];
