#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const SERVICE_NAME = 'neopro-sync-agent';
const SERVICE_FILE = `/etc/systemd/system/${SERVICE_NAME}.service`;
const AGENT_PATH = path.resolve(__dirname, '..');
const AGENT_SCRIPT = path.join(AGENT_PATH, 'src/agent.js');

const serviceContent = `[Unit]
Description=NEOPRO Sync Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=neopro
Group=neopro
WorkingDirectory=${AGENT_PATH}
ExecStart=/usr/bin/node ${AGENT_SCRIPT}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment="NODE_ENV=production"
Environment="CONFIG_FILE=/etc/neopro/site.conf"

[Install]
WantedBy=multi-user.target
`;

async function installService() {
  console.log('🔧 Installing NEOPRO Sync Agent service...');

  try {
    if (process.getuid() !== 0) {
      console.error('❌ This script must be run as root (use sudo)');
      process.exit(1);
    }

    console.log('📝 Creating service file...');
    await fs.writeFile(SERVICE_FILE, serviceContent);
    console.log(`✅ Service file created: ${SERVICE_FILE}`);

    console.log('🔄 Reloading systemd daemon...');
    execSync('systemctl daemon-reload', { stdio: 'inherit' });

    console.log('✅ Enabling service...');
    execSync(`systemctl enable ${SERVICE_NAME}`, { stdio: 'inherit' });

    console.log('🚀 Starting service...');
    execSync(`systemctl start ${SERVICE_NAME}`, { stdio: 'inherit' });

    console.log('📊 Service status:');
    execSync(`systemctl status ${SERVICE_NAME} --no-pager`, { stdio: 'inherit' });

    console.log('');
    console.log('✅ Installation completed successfully!');
    console.log('');
    console.log('Useful commands:');
    console.log(`  sudo systemctl status ${SERVICE_NAME}    - Check status`);
    console.log(`  sudo systemctl restart ${SERVICE_NAME}   - Restart service`);
    console.log(`  sudo systemctl stop ${SERVICE_NAME}      - Stop service`);
    console.log(`  sudo journalctl -u ${SERVICE_NAME} -f    - View logs`);
  } catch (error) {
    console.error('❌ Installation failed:', error.message);
    process.exit(1);
  }
}

installService();
