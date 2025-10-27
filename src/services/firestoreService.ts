import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import '../config/firebase';

// Interfaces for our data models
interface CarrierInfo {
  name: string;
  [key: string]: unknown;
}

interface ScanData {
  carrier: string | CarrierInfo;
  dateYmd: string;
  timestamp: string;
  tracking: string;
}

interface CarrierBreakdown {
  [key: string]: number;
}

interface KpiData {
  totalScansToday: number;
  totalScansThisMonth: number;
  activeCarriers: number;
  averageDailyScans: number;
  lastSyncTime: string;
  todayCarrierBreakdown: CarrierBreakdown;
  monthCarrierBreakdown: CarrierBreakdown;
}

// Initialize Firestore
const db = getFirestore();

// Removing unused helper functions

// Fetch KPI data from Firestore
// Debug mode flag
const DEBUG_MODE = true;

// Debug logging function
const debugLog = (...args: unknown[]) => {
  if (DEBUG_MODE) {
    console.log(...args);
  }
};

export const fetchKpiData = async (): Promise<KpiData> => {
  try {
    const packagesCollection = collection(db, 'packages');
    
    // Format current date for comparison
    const today = new Date();
    const todayFormatted = format(today, 'yyyyMMdd'); // Format as YYYYMMDD
    const monthFormatted = format(today, 'yyyyMM');   // Format as YYYYMM
    
    debugLog('Searching for documents with today date:', todayFormatted);
    debugLog('Searching for documents with month:', monthFormatted);
    
    // Get all documents from packages collection
    const packagesSnapshot = await getDocs(packagesCollection);
    debugLog('Total documents found:', packagesSnapshot.size);
    
    // Process all scans
    const allScans: ScanData[] = [];
    packagesSnapshot.forEach(document => {
      try {
        const data = document.data() as ScanData;
        // Debug the document structure to help troubleshoot
        debugLog('Document ID:', document.id);
        debugLog('Document data:', JSON.stringify(data));
        
        allScans.push(data);
      } catch (error) {
        console.error('Error processing document:', document.id, error);
      }
    });
    
    // Debug first 3 scans data structure
    if (allScans.length > 0) {
      debugLog('Sample scan data:', JSON.stringify(allScans.slice(0, 3)));
    } else {
      debugLog('No scan data found');
    }
    
    // Filter scans for today and this month
    const todayScans = allScans.filter(scan => {
      // Debug dateYmd field
      if (scan.dateYmd) {
        debugLog('Comparing dateYmd:', scan.dateYmd, 'with today:', todayFormatted, 
                'matches:', scan.dateYmd === todayFormatted);
      }
      // Check if dateYmd is today's date
      return scan.dateYmd === todayFormatted;
    });
    
    const monthScans = allScans.filter(scan => {
      // Check if dateYmd starts with current year and month
      return scan.dateYmd && scan.dateYmd.startsWith(monthFormatted);
    });
    
    debugLog('Today scans:', todayScans.length);
    debugLog('Month scans:', monthScans.length);
    
    // Get carrier breakdowns
    const todayCarrierBreakdown = getCarrierBreakdown(todayScans);
    const monthCarrierBreakdown = getCarrierBreakdown(monthScans);
    
    // Count unique active carriers
    const activeCarriers = Object.keys(monthCarrierBreakdown).length;
    
    // Calculate average daily scans for the month
    // const dayOfMonth = today.getDate();
    // const averageDailyScans = Math.round(monthScans.length / dayOfMonth);
   
    // NEW LOGIC — Use unique scan days instead of dayOfMonth
    const uniqueScanDays = new Set<string>();
    monthScans.forEach(scan => {
      if (scan.dateYmd) uniqueScanDays.add(scan.dateYmd);
    });
    const daysWithScans = uniqueScanDays.size || 1; // avoid divide-by-zero
    const averageDailyScans = Math.round(monthScans.length / daysWithScans);
   
   
    // Get last sync time - use the most recent timestamp from the scans
    let lastSyncTime = format(new Date(), 'HH:mm:ss');
    
    if (allScans.length > 0) {
      // Sort by timestamp descending to get the most recent one
      const sortedScans = [...allScans].sort((a, b) => {
        if (!a.timestamp || !b.timestamp) return 0;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      
      if (sortedScans[0] && sortedScans[0].timestamp) {
        const latestTimestamp = new Date(sortedScans[0].timestamp);
        lastSyncTime = format(latestTimestamp, 'HH:mm:ss');
      }
    }
    
    // Return the KPI data
    return {
      totalScansToday: todayScans.length,
      totalScansThisMonth: monthScans.length,
      activeCarriers,
      averageDailyScans,
      lastSyncTime,
      todayCarrierBreakdown,
      monthCarrierBreakdown
    };
  } catch (error) {
    console.error('Error fetching KPI data:', error);
    // Return default values in case of error
    return {
      totalScansToday: 0,
      totalScansThisMonth: 0,
      activeCarriers: 0,
      averageDailyScans: 0,
      lastSyncTime: format(new Date(), 'HH:mm:ss'),
      todayCarrierBreakdown: {},
      monthCarrierBreakdown: {}
    };
  }
};

// Helper function to calculate carrier breakdown
const getCarrierBreakdown = (scans: ScanData[]): CarrierBreakdown => {
  const breakdown: CarrierBreakdown = {};
  
  scans.forEach(scan => {
    // Make sure carrier exists before adding to breakdown
    if (scan && scan.carrier) {
      // Handle carrier as a string or as an object that might be stringified
      let carrier: string;
      
      if (typeof scan.carrier === 'string') {
        // Clean up carrier name (remove quotes if they exist)
        carrier = scan.carrier.replace(/^["'](.+)["']$/, '$1');
        
        // If it looks like JSON, try to parse it
        if (scan.carrier.startsWith('{') && scan.carrier.endsWith('}')) {
          try {
            const carrierObj = JSON.parse(scan.carrier);
            carrier = (carrierObj && typeof carrierObj === 'object' && 'name' in carrierObj) 
              ? String(carrierObj.name) 
              : carrier;
          } catch {
            // If parsing fails, keep original value
            debugLog('Failed to parse carrier JSON:', scan.carrier);
          }
        }
      } else if (typeof scan.carrier === 'object' && scan.carrier !== null) {
        // Handle object directly if it's already an object
        const carrierObj = scan.carrier as CarrierInfo;
        carrier = carrierObj.name || 'Unknown Carrier';
      } else {
        carrier = 'Unknown Carrier';
      }
      
      // Standardize carrier names for consistency
      if (carrier.includes('FedEx') && carrier.includes('Express')) {
        carrier = 'FedEx Express';
      } else if (carrier.includes('FedEx') && carrier.includes('Ground')) {
        carrier = 'FedEx Ground';
      } else if (carrier.includes('UPS')) {
        carrier = 'UPS';
      }
      
      // Add to breakdown
      if (breakdown[carrier]) {
        breakdown[carrier]++;
      } else {
        breakdown[carrier] = 1;
      }
    }
  });
  
  return breakdown;
};

// Function to update the last sync time in Firestore
export const updateLastSyncTime = async (): Promise<string> => {
  try {
    const now = new Date();
    const formattedTime = format(now, 'HH:mm:ss');
    
    // In a real implementation, you would update Firestore here
    // For now, we just return the current time
    return formattedTime;
  } catch (error) {
    console.error('Error updating last sync time:', error);
    return format(new Date(), 'HH:mm:ss');
  }
};