// Device ID to friendly label mapping
export const deviceLabels: Record<string, string> = {
  'b7f808ed475dda7e': 'Scanner Device 1',
  // Add more device mappings here as needed
  // 'device_id_2': 'Scanner Device 2',
  // 'device_id_3': 'Warehouse Scanner A',
};

/**
 * Get a friendly label for a device ID
 * @param deviceId - The raw device ID
 * @returns The friendly label or the original ID if no mapping exists
 */
export const getDeviceLabel = (deviceId: string | undefined): string => {
  if (!deviceId) return 'N/A';
  return deviceLabels[deviceId] || deviceId;
};

/**
 * Get the device ID from a label
 * @param label - The friendly label
 * @returns The device ID or undefined if not found
 */
export const getDeviceIdFromLabel = (label: string): string | undefined => {
  const entry = Object.entries(deviceLabels).find(([_, value]) => value === label);
  return entry?.[0];
};
