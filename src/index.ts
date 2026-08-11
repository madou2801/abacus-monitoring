import { config } from './config.js';
import { logger } from './logger.js';
import { buildContainer } from './container.js';
import { createApp } from './app.js';

const container = buildContainer();
const app = createApp(container);

const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv, ligdicashMock: config.ligdicash.mock },
    '🚀 AbacusPay démarré',
  );
});

// Arrêt propre (drain des connexions) sur signaux d'orchestrateur.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    logger.info({ sig }, 'Arrêt en cours…');
    server.close(() => process.exit(0));
  });
}
