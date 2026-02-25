import { clearStore } from './store.js';

async function main() {
    try {
        await clearStore();
        console.log('✅ Discord store cleared. emailMap.json deleted.');
    } catch (err) {
        console.error('Failed to clear discord store:', err);
        process.exitCode = 1;
    }
}

main();
