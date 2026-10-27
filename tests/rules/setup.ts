// Shared set-up for the security-rules tests. They run against the Firestore and Storage
// emulators (`npm run test:rules` starts both), never a real project: the `demo-` prefix
// makes the emulators refuse to reach any live Firebase service.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

export const PROJECT_ID = 'demo-revil';

export function startRulesEnv(): Promise<RulesTestEnvironment> {
    const root = process.cwd();
    return initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules: readFileSync(resolve(root, 'firestore.rules'), 'utf8') },
        storage: { rules: readFileSync(resolve(root, 'storage.rules'), 'utf8') },
    });
}

/** The three kinds of caller the rules tell apart. */
export const ADMIN = { uid: 'owner', claims: { admin: true } };
export const SIGNED_IN = { uid: 'someone', claims: {} };
