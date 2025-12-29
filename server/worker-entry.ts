import { startWorker } from "./jobWorker";

console.log("=== Background Worker Starting ===");
console.log("This worker processes video downloads, AI dubbing, and other background jobs.");

const worker = startWorker('production-worker', 2000, 2);

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down worker...');
  worker.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down worker...');
  worker.stop();
  process.exit(0);
});

console.log("Worker is now polling for jobs...");
