import { fetchKpiData } from '../services/firestoreService';

/**
 * This utility function can be used to debug the Firestore data retrieval
 * Import and call this function from a component to test the fetch functionality
 */
export const testFirestoreData = async () => {
  console.log('--- Testing Firestore Data Retrieval ---');
  
  try {
    console.time('fetchKpiData');
    const data = await fetchKpiData();
    console.timeEnd('fetchKpiData');
    
    console.log('KPI Data retrieved successfully:');
    console.log(JSON.stringify(data, null, 2));
    
    // Check for essential data points
    console.log('\nData validation:');
    console.log('- Total scans today:', data.totalScansToday);
    console.log('- Total scans this month:', data.totalScansThisMonth);
    console.log('- Today carrier breakdown:', Object.keys(data.todayCarrierBreakdown).length, 'carriers');
    console.log('- Month carrier breakdown:', Object.keys(data.monthCarrierBreakdown).length, 'carriers');
    
    return data;
  } catch (error) {
    console.error('Error testing Firestore data:', error);
    throw error;
  }
};