import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts', 'functions/src/**/*.test.ts', 'scripts/**/*.test.mjs'],
        environment: 'node',
    },
});
