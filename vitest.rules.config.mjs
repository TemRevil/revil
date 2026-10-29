import { defineConfig } from 'vitest/config';

// Security-rules tests: they need the Firestore and Storage emulators, so they run only
// through `npm run test:rules`, which starts both, and never in plain `npm test`.
export default defineConfig({
    test: {
        include: ['tests/rules/**/*.test.ts'],
        environment: 'node',
        // One emulator, shared state: run the files one after another.
        fileParallelism: false,
        testTimeout: 20_000,
        hookTimeout: 30_000,
    },
});
