const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const configPath = path.resolve(__dirname, '../capacitor.config.json');

// 1. Find local IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Look for IPv4 that is not internal/loopback
      if (iface.family === 'IPv4' && !iface.internal) {
        // Typically home Wi-Fi starts with 192.168 or 10.
        if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
          return iface.address;
        }
      }
    }
  }
  // Fallback to any external IPv4 if no standard private subnet found
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIp();
const port = 3000;
const devServerUrl = `http://${localIp}:${port}`;

console.log(`\n🚀 [Live Reload] Endereço de IP local detectado: ${localIp}`);
console.log(`🔗 [Live Reload] O celular conectará em: ${devServerUrl}\n`);

// 2. Read existing capacitor.config.json
let config = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Backup original config to restore on exit
const originalConfig = JSON.parse(JSON.stringify(config));

// 3. Update config with server url for Live Reload
config.server = {
  url: devServerUrl,
  cleartext: true
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
console.log('✅ capacitor.config.json atualizado com URL do servidor local.');

// 4. Run Capacitor Sync
console.log('🔄 Sincronizando configurações com as plataformas nativas...');
try {
  execSync('npx cap sync', { stdio: 'inherit' });
  console.log('✅ Sincronização concluída com sucesso!');
} catch (e) {
  console.error('❌ Falha ao sincronizar o Capacitor:', e.message);
}

// 5. Start dev server and handle clean exit
console.log('\n💻 Iniciando o servidor de desenvolvimento (npx pnpm dev)...');
const devProcess = spawn('npx', ['pnpm', 'run', 'dev'], { stdio: 'inherit', shell: true });

function cleanup() {
  console.log('\n🧹 Restaurando capacitor.config.json para produção...');
  try {
    fs.writeFileSync(configPath, JSON.stringify(originalConfig, null, 2), 'utf8');
    console.log('✅ Configuração restaurada com sucesso.');
  } catch (err) {
    console.error('❌ Erro ao restaurar configuração:', err.message);
  }
  process.exit();
}

// Handle exit signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

devProcess.on('close', (code) => {
  cleanup();
});
