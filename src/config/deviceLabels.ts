import {
  getDeviceLabel as getDeviceLabelFromService,
  getDeviceLabelSync,
  getDeviceIdFromLabel as getDeviceIdFromLabelService,
  migrateDevice
} from '../services/deviceService';

// Legacy device mapping for migration
const LEGACY_DEVICES: Record<string, string> = {
  'b7f808ed475dda7e': 'Scanner Device 1',
};

// Migration flag to ensure we only migrate once
let migrationComplete = false;

/**
 * Migrate legacy hardcoded devices to Firestore on first load
 */
async function migrateLegacyDevices(): Promise<void> {
  if (migrationComplete) return;

  try {
    for (const [deviceId, label] of Object.entries(LEGACY_DEVICES)) {
      await migrateDevice(deviceId, label);
    }
    migrationComplete = true;
    console.log('Legacy device migration completed');
  } catch (error) {
    console.error('Error migrating legacy devices:', error);
  }
}

// Run migration on module load
migrateLegacyDevices();

/**
 * Get a friendly label for a device ID (async version)
 * @param deviceId - The raw device ID
 * @returns The friendly label or the original ID if no mapping exists
 */
export const getDeviceLabel = async (deviceId: string | undefined): Promise<string> => {
  return await getDeviceLabelFromService(deviceId);
};

/**
 * Get a friendly label for a device ID (synchronous version using cache)
 * Use this when you need immediate results (e.g., in render functions)
 * @param deviceId - The raw device ID
 * @returns The friendly label from cache or the original ID if not in cache
 */
export const getDeviceLabelFromCache = (deviceId: string | undefined): string => {
  return getDeviceLabelSync(deviceId);
};

/**
 * Get the device ID from a label (async version)
 * @param label - The friendly label
 * @returns The device ID or undefined if not found
 */
export const getDeviceIdFromLabel = async (label: string): Promise<string | undefined> => {
  return await getDeviceIdFromLabelService(label);
};

