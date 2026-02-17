// @ts-check
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');

const execAsync = util.promisify(exec);

const SITE_CONF_PATH = '/etc/neopro/site.conf';

/**
 * Updates the system hostname on the Raspberry Pi.
 *
 * Operations:
 * 1. Validates hostname format (Linux rules)
 * 2. Writes to /etc/hostname
 * 3. Updates /etc/hosts (127.0.1.1 entry)
 * 4. Applies via hostnamectl
 * 5. Persists HOSTNAME_SLUG in /etc/neopro/site.conf
 * 6. Configures Avahi interfaces + restarts for mDNS propagation
 *
 * @param {Object} data - { hostname: string }
 * @returns {Promise<{ success: boolean, oldHostname: string, newHostname: string, changed: boolean, verified: boolean, message: string }>}
 */
async function updateHostname(data) {
  const { hostname } = data;

  if (!hostname) {
    throw new Error('hostname is required');
  }

  // Validate Linux hostname rules
  if (hostname.length > 63) {
    throw new Error('Hostname must be 63 characters or less');
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(hostname)) {
    throw new Error(
      'Invalid hostname format: lowercase alphanumeric and hyphens only, no leading/trailing hyphens'
    );
  }

  logger.info('Updating system hostname', { newHostname: hostname });

  try {
    // 1. Read current hostname
    const { stdout: currentRaw } = await execAsync('hostnamectl --static');
    const oldHostname = currentRaw.trim();

    if (oldHostname === hostname) {
      logger.info('Hostname already matches, no change needed', { hostname });
      return {
        success: true,
        oldHostname,
        newHostname: hostname,
        changed: false,
        verified: true,
        message: 'Hostname already set correctly',
      };
    }

    // 2. Write /etc/hostname
    await execAsync(`echo "${hostname}" | sudo tee /etc/hostname > /dev/null`);
    logger.info('Updated /etc/hostname');

    // 3. Update /etc/hosts (127.0.1.1 entry)
    await execAsync(
      `sudo sed -i 's/127.0.1.1.*/127.0.1.1\\t${hostname}.local ${hostname}/' /etc/hosts`
    );
    logger.info('Updated /etc/hosts');

    // 4. Apply with hostnamectl
    await execAsync(`sudo hostnamectl set-hostname ${hostname}`);
    logger.info('Applied hostname via hostnamectl');

    // 5. Persist in site.conf for boot-time scripts (fix-hostname.sh)
    await persistHostnameSlug(hostname);

    // 6. Configure Avahi and restart
    await configureAvahi();

    // 7. Verify
    const { stdout: verifiedRaw } = await execAsync('hostnamectl --static');
    const verified = verifiedRaw.trim() === hostname;

    logger.info('Hostname update completed', {
      oldHostname,
      newHostname: hostname,
      verified,
    });

    return {
      success: true,
      oldHostname,
      newHostname: hostname,
      changed: true,
      verified,
      message: verified
        ? `Hostname changed from ${oldHostname} to ${hostname}.local`
        : `Hostname written but verification returned ${verifiedRaw.trim()}. Reboot may be needed.`,
    };
  } catch (error) {
    logger.error('Hostname update failed', { error: error.message });
    throw error;
  }
}

/**
 * Persists HOSTNAME_SLUG in /etc/neopro/site.conf so fix-hostname.sh
 * and install.sh can read it on boot.
 */
async function persistHostnameSlug(hostname) {
  try {
    if (await fs.pathExists(SITE_CONF_PATH)) {
      let conf = await fs.readFile(SITE_CONF_PATH, 'utf8');
      if (/^HOSTNAME_SLUG=.*$/m.test(conf)) {
        conf = conf.replace(/^HOSTNAME_SLUG=.*$/m, `HOSTNAME_SLUG=${hostname}`);
      } else {
        conf = conf.trimEnd() + `\nHOSTNAME_SLUG=${hostname}\n`;
      }
      await execAsync(
        `echo '${conf.replace(/'/g, "'\\''")}' | sudo tee ${SITE_CONF_PATH} > /dev/null`
      );
      logger.info('Persisted HOSTNAME_SLUG in site.conf');
    } else {
      logger.warn('site.conf not found, skipping hostname persistence', {
        path: SITE_CONF_PATH,
      });
    }
  } catch (error) {
    logger.warn('Failed to persist hostname in site.conf (non-blocking)', {
      error: error.message,
    });
  }
}

/**
 * Ensures Avahi is configured for all network interfaces and restarts the daemon.
 */
async function configureAvahi() {
  const avahiConf = '/etc/avahi/avahi-daemon.conf';

  try {
    if (await fs.pathExists(avahiConf)) {
      const confContent = await fs.readFile(avahiConf, 'utf8');
      if (/^#?allow-interfaces=/.test(confContent.split('\n').find((l) => l.includes('allow-interfaces')) || '')) {
        await execAsync(
          `sudo sed -i 's/^#\\?allow-interfaces=.*/allow-interfaces=eth0,wlan0,wlan1/' ${avahiConf}`
        );
      } else {
        await execAsync(
          `sudo sed -i '/^\\[server\\]/a allow-interfaces=eth0,wlan0,wlan1' ${avahiConf}`
        );
      }
    }

    await execAsync('sudo systemctl restart avahi-daemon');
    logger.info('Avahi daemon restarted');
  } catch (error) {
    logger.warn('Failed to configure/restart Avahi (non-blocking)', {
      error: error.message,
    });
  }
}

module.exports = { updateHostname };
