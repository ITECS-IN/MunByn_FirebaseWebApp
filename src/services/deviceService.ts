import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    orderBy,
    Timestamp,
    runTransaction
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface Device {
    deviceId: string;
    label: string;
    registeredAt: Timestamp;
    lastSeenAt: Timestamp;
    isActive: boolean;
    scanCount?: number;
}

const DEVICES_COLLECTION = 'devices';

// In-memory cache for device labels to reduce Firestore reads
const deviceLabelCache = new Map<string, string>();
let cacheInitialized = false;

/**
 * Initialize the device label cache by loading all devices from Firestore
 */
async function initializeCache(): Promise<void> {
    if (cacheInitialized) return;

    try {
        const devices = await getAllDevices();
        devices.forEach(device => {
            deviceLabelCache.set(device.deviceId, device.label);
        });
        cacheInitialized = true;
    } catch (error) {
        console.error('Error initializing device cache:', error);
    }
}

/**
 * Generate the next sequential device label (Scanner Device 1, Scanner Device 2, etc.)
 */
async function generateNextDeviceLabel(): Promise<string> {
    const devicesRef = collection(db, DEVICES_COLLECTION);
    const q = query(devicesRef, orderBy('registeredAt', 'asc'));
    const snapshot = await getDocs(q);

    // Count how many devices already exist
    const deviceCount = snapshot.size;
    return `Scanner Device ${deviceCount + 1}`;
}

/**
 * Register a new device if it doesn't already exist
 * @param deviceId - The unique device identifier
 * @returns The device label (existing or newly created)
 */
export async function registerDeviceIfNew(deviceId: string): Promise<string> {
    if (!deviceId) {
        throw new Error('Device ID is required');
    }

    const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);

    try {
        // Use a transaction to ensure atomic read-check-write
        const result = await runTransaction(db, async (transaction) => {
            const deviceDoc = await transaction.get(deviceRef);

            if (deviceDoc.exists()) {
                // Device already registered, update last seen
                const deviceData = deviceDoc.data() as Device;
                transaction.update(deviceRef, {
                    lastSeenAt: Timestamp.now(),
                    scanCount: (deviceData.scanCount || 0) + 1
                });
                return deviceData.label;
            } else {
                // New device, register it
                const label = await generateNextDeviceLabel();
                const newDevice: Device = {
                    deviceId,
                    label,
                    registeredAt: Timestamp.now(),
                    lastSeenAt: Timestamp.now(),
                    isActive: true,
                    scanCount: 1
                };
                transaction.set(deviceRef, newDevice);

                // Update cache
                deviceLabelCache.set(deviceId, label);

                return label;
            }
        });

        return result;
    } catch (error) {
        console.error('Error registering device:', error);
        throw error;
    }
}

/**
 * Get the friendly label for a device ID
 * @param deviceId - The raw device ID
 * @returns The friendly label or the raw ID if not found
 */
export async function getDeviceLabel(deviceId: string | undefined): Promise<string> {
    if (!deviceId) return 'N/A';

    // Initialize cache on first call
    if (!cacheInitialized) {
        await initializeCache();
    }

    // Check cache first
    if (deviceLabelCache.has(deviceId)) {
        return deviceLabelCache.get(deviceId)!;
    }

    // If not in cache, fetch from Firestore
    try {
        const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);
        const deviceDoc = await getDoc(deviceRef);

        if (deviceDoc.exists()) {
            const device = deviceDoc.data() as Device;
            deviceLabelCache.set(deviceId, device.label);
            return device.label;
        }
    } catch (error) {
        console.error('Error fetching device label:', error);
    }

    // Fallback to raw device ID
    return deviceId;
}

/**
 * Get the friendly label for a device ID (synchronous version using cache)
 * @param deviceId - The raw device ID
 * @returns The friendly label from cache or the raw ID if not in cache
 */
export function getDeviceLabelSync(deviceId: string | undefined): string {
    if (!deviceId) return 'N/A';
    return deviceLabelCache.get(deviceId) || deviceId;
}

/**
 * Get all registered devices
 * @returns Array of all devices sorted by registration date
 */
export async function getAllDevices(): Promise<Device[]> {
    try {
        const devicesRef = collection(db, DEVICES_COLLECTION);
        const q = query(devicesRef, orderBy('registeredAt', 'asc'));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => doc.data() as Device);
    } catch (error) {
        console.error('Error fetching all devices:', error);
        return [];
    }
}

/**
 * Update the last seen timestamp for a device
 * @param deviceId - The device ID to update
 */
export async function updateDeviceLastSeen(deviceId: string): Promise<void> {
    if (!deviceId) return;

    try {
        const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);
        await updateDoc(deviceRef, {
            lastSeenAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Error updating device last seen:', error);
    }
}

/**
 * Rename a device label
 * @param deviceId - The device ID to rename
 * @param newLabel - The new friendly label
 */
export async function renameDevice(deviceId: string, newLabel: string): Promise<void> {
    if (!deviceId || !newLabel) {
        throw new Error('Device ID and new label are required');
    }

    try {
        const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);
        await updateDoc(deviceRef, {
            label: newLabel
        });

        // Update cache
        deviceLabelCache.set(deviceId, newLabel);
    } catch (error) {
        console.error('Error renaming device:', error);
        throw error;
    }
}

/**
 * Get the device ID from a label (reverse lookup)
 * @param label - The friendly label
 * @returns The device ID or undefined if not found
 */
export async function getDeviceIdFromLabel(label: string): Promise<string | undefined> {
    // Initialize cache if needed
    if (!cacheInitialized) {
        await initializeCache();
    }

    // Search cache
    for (const [deviceId, deviceLabel] of deviceLabelCache.entries()) {
        if (deviceLabel === label) {
            return deviceId;
        }
    }

    return undefined;
}

/**
 * Migrate an existing hardcoded device to Firestore
 * @param deviceId - The device ID
 * @param label - The label to assign
 */
export async function migrateDevice(deviceId: string, label: string): Promise<void> {
    const deviceRef = doc(db, DEVICES_COLLECTION, deviceId);

    try {
        const deviceDoc = await getDoc(deviceRef);

        if (!deviceDoc.exists()) {
            const newDevice: Device = {
                deviceId,
                label,
                registeredAt: Timestamp.now(),
                lastSeenAt: Timestamp.now(),
                isActive: true,
                scanCount: 0
            };
            await setDoc(deviceRef, newDevice);
            deviceLabelCache.set(deviceId, label);
            console.log(`Migrated device ${deviceId} with label ${label}`);
        }
    } catch (error) {
        console.error('Error migrating device:', error);
        throw error;
    }
}
