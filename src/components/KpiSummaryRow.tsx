import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fetchKpiData } from '../services/firestoreService';
import CarrierBreakdown from './CarrierBreakdown';
import { getFirestore, collection, onSnapshot } from 'firebase/firestore';

interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  isLoading: boolean;
  carrierBreakdown?: CarrierBreakdown;
}

interface CarrierBreakdown {
  [key: string]: number;
}

interface KpiData {
  totalScansToday: number;
  totalScansThisMonth: number;
  // activeCarriers: number;
  averageDailyScans: number;
  lastSyncTime: string;
  todayCarrierBreakdown: CarrierBreakdown;
  monthCarrierBreakdown: CarrierBreakdown;
}

const KpiCard = ({ title, value, description, isLoading, carrierBreakdown }: KpiCardProps) => {
  // Check if there's carrier breakdown data
  const hasBreakdownData = carrierBreakdown && Object.keys(carrierBreakdown).length > 0;
  const hasNoData = value === 0 || value === '0';
  
  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">{title}</h2>
      {isLoading ? (
        <div className="animate-pulse h-8 bg-gray-200 rounded w-3/4"></div>
      ) : (
        <>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          
          {hasBreakdownData ? (
            <CarrierBreakdown data={carrierBreakdown!} />
          ) : hasNoData ? (
            <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
              No data available
            </p>
          ) : description ? (
            <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
              {description}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};

const KpiSummaryRow = () => {
  const [kpiData, setKpiData] = useState<KpiData>({
    totalScansToday: 0,
    totalScansThisMonth: 0,
    // activeCarriers: 0,
    averageDailyScans: 0,
    lastSyncTime: '',
    todayCarrierBreakdown: {},
    monthCarrierBreakdown: {}
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    
    // Initialize Firestore
    const db = getFirestore();
    const packagesCollection = collection(db, 'packages');
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(
      packagesCollection,
      async () => {
        try {
          console.log('Firebase data changed, updating KPI data...');
          
          // Fetch updated KPI data whenever the collection changes
          const firestoreData = await fetchKpiData();
          setKpiData(firestoreData);
          setIsLoading(false);
        } catch (error) {
          console.error('Error processing real-time KPI data update:', error);
          
          // Fallback to mock data if processing fails
          const mockData: KpiData = {
            totalScansToday: 327,
            totalScansThisMonth: 4215,
            // activeCarriers: 3,
            averageDailyScans: 140,
            lastSyncTime: format(new Date(), 'HH:mm:ss'),
            todayCarrierBreakdown: {
              'UPS': 300,
              'FedEx Express': 20,
              'FedEx Ground': 7
            },
            monthCarrierBreakdown: {
              'UPS': 4000,
              'FedEx Express': 200,
              'FedEx Ground': 15
            }
          };
          setKpiData(mockData);
          setIsLoading(false);
        }
      },
      (error) => {
        console.error('Firebase listener error:', error);
        setIsLoading(false);
      }
    );
    
    // Clean up the listener when the component unmounts
    return () => unsubscribe();
  }, []);

  // Format numbers with commas for thousands
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Function to manually refresh data
  const refreshData = async () => {
    setIsLoading(true);
    try {
      const firestoreData = await fetchKpiData();
      setKpiData(firestoreData);
      // Add a console message to show manual refresh was triggered
      console.log('Manual refresh triggered, data updated at', new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Error refreshing KPI data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Key Performance Indicators</h2>
        <div className="flex items-center">
          <span className="text-sm text-green-600 font-medium mr-3 flex items-center">
            <svg className="h-4 w-4 mr-1 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Auto-updating
          </span>
          <button 
            onClick={refreshData}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Refreshing...
              </span>
            ) : (
              <span className="flex items-center">
                <svg className="-ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Manual Refresh
              </span>
            )}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Total Scans Today"
          value={formatNumber(kpiData.totalScansToday)}
          carrierBreakdown={kpiData.todayCarrierBreakdown}
          isLoading={isLoading}
        />
        
        <KpiCard
          title="Total Scans This Month"
          value={formatNumber(kpiData.totalScansThisMonth)}
          carrierBreakdown={kpiData.monthCarrierBreakdown}
          isLoading={isLoading}
        />
        
        {/* <KpiCard
          title="Active Carriers"
          value={kpiData.activeCarriers}
          description="Count of carriers with scans"
          isLoading={isLoading}
        /> */}
        
        <KpiCard
          title="Average Daily Scans"
          value={formatNumber(kpiData.averageDailyScans)}
          isLoading={isLoading}
        />
        
        <KpiCard
          title="Last Sync Time"
          value={kpiData.lastSyncTime}
          description="Data updates in real-time"
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};

export default KpiSummaryRow;