import React, { useState, useEffect } from 'react';
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, PieChart, Pie, Cell
} from 'recharts';
import { fetchKpiData } from '../services/firestoreService';
import { format } from 'date-fns';
import { getFirestore, collection, getDocs, onSnapshot } from 'firebase/firestore';

// Define types
interface DailyScans {
  date: string;
  [key: string]: number | string; // carrier name as key, count as value, plus date string
}

interface CarrierData {
  name: string;
  value: number;
  [key: string]: string | number; // Index signature for recharts compatibility
}

// Colors for different carriers
const CARRIER_COLORS: { [key: string]: string } = {
  'UPS': '#ff9800',
  'FedEx Express': '#2196f3',
  'FedEx Ground': '#4caf50',
  'DHL': '#ffc107',
  'Amazon': '#ff5722'
};

// Default color array for charts
const DEFAULT_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

const ChartsSection: React.FC = () => {
  // State for time chart
  const [timeChartData, setTimeChartData] = useState<DailyScans[]>([]);
  const [isTimeChartLoading, setIsTimeChartLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'daily' | 'monthly'>('daily');
  const [timeChartLastUpdated, setTimeChartLastUpdated] = useState<Date | null>(null);
  
  // State for carrier share chart
  const [carrierShareData, setCarrierShareData] = useState<CarrierData[]>([]);
  const [isShareChartLoading, setIsShareChartLoading] = useState(true);
  const [shareTimeframe, setShareTimeframe] = useState<'today' | 'month'>('today');
  const [shareChartLastUpdated, setShareChartLastUpdated] = useState<Date | null>(null);

  // No need for separate processing functions since we're handling this directly in useEffect

  // Initialize Firestore
  const db = getFirestore();

  // Define scan data interface
  interface ScanData {
    dateYmd?: string;
    carrier?: string | { name?: string } | Record<string, unknown>;
    tracking?: string;
    timestamp?: string;
    [key: string]: unknown;
  }
  
  // Setup listener for real-time updates when data changes
  useEffect(() => {
    // Setup a listener for changes in the packages collection
    const packagesCollection = collection(db, 'packages');
    const unsubscribe = onSnapshot(
      packagesCollection, 
      async () => {
        console.log('Database updated, refreshing charts...');
        
        // Trigger data load for both charts
        loadTimeChartData();
        loadCarrierShareData();
      },
      (error) => {
        console.error('Error listening to package changes:', error);
      }
    );
    
    // Cleanup listener on component unmount
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]); // We don't want to include the loadX functions in the dependency array to avoid infinite loops
  
  // Function to load carrier share data
  const loadCarrierShareData = async () => {
    setIsShareChartLoading(true);
    
    try {
      // Get KPI data for carrier breakdown
      const kpiData = await fetchKpiData();
      
      // Process carrier share data from KPI data
      let shareData: CarrierData[] = [];
      if (shareTimeframe === 'today') {
        shareData = Object.entries(kpiData.todayCarrierBreakdown)
          .map(([name, value]) => ({ name, value }))
          .filter(item => item.value > 0);
      } else {
        shareData = Object.entries(kpiData.monthCarrierBreakdown)
          .map(([name, value]) => ({ name, value }))
          .filter(item => item.value > 0);
      }
      
      setCarrierShareData(shareData);
      setShareChartLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading carrier share data:', error);
      setCarrierShareData([]);
    } finally {
      setIsShareChartLoading(false);
    }
  };
  
  // Function to load time chart data
  const loadTimeChartData = async () => {
    setIsTimeChartLoading(true);
    
    try {
      // Fetch all packages data for time chart
      const allScans = await fetchAllPackages();
      
      // Create a map to store date-wise data
      const dateMap = new Map<string, { [carrier: string]: number }>();
      
      // Process each scan and aggregate by date and carrier
      allScans.forEach(scan => {
        if (!scan.dateYmd || !scan.carrier) return;
        
        // Format date based on range
        let dateKey;
        try {
          const dateObj = new Date(
            parseInt(scan.dateYmd.substring(0, 4)),
            parseInt(scan.dateYmd.substring(4, 6)) - 1, // Month is 0-indexed
            parseInt(scan.dateYmd.substring(6, 8))
          );
          
          dateKey = timeRange === 'daily' 
            ? format(dateObj, 'MM/dd')
            : format(dateObj, 'MM/yyyy');
        } catch {
          console.error('Invalid date format:', scan.dateYmd);
          return;
        }
        
        // Get carrier name
        let carrierName = typeof scan.carrier === 'string' 
          ? scan.carrier 
          : (scan.carrier as {name?: string}).name || 'Unknown';
          
        // Normalize carrier names
        if (carrierName.includes('FedEx') && carrierName.includes('Express')) {
          carrierName = 'FedEx Express';
        } else if (carrierName.includes('FedEx') && carrierName.includes('Ground')) {
          carrierName = 'FedEx Ground';
        } else if (carrierName.includes('UPS')) {
          carrierName = 'UPS';
        }
        
        // Create or update date entry
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, {});
        }
        
        const dateData = dateMap.get(dateKey)!;
        dateData[carrierName] = (dateData[carrierName] || 0) + 1;
      });
      
      // Convert map to array and sort by date
      const chartData: DailyScans[] = Array.from(dateMap.entries()).map(([date, carriers]) => {
        return {
          date,
          ...carriers
        };
      });
      
      // Sort by date
      chartData.sort((a, b) => {
        // Parse MM/DD or MM/YYYY format
        const partsA = a.date.split('/');
        const partsB = b.date.split('/');
        
        if (partsA[0] !== partsB[0]) { // Compare months
          return parseInt(partsA[0]) - parseInt(partsB[0]);
        } else { // Compare days/years
          return parseInt(partsA[1]) - parseInt(partsB[1]);
        }
      });
      
      setTimeChartData(chartData);
      setTimeChartLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading time chart data:', error);
      setTimeChartData([]);
    } finally {
      setIsTimeChartLoading(false);
    }
  };

  // Fetch data from Firestore
  const fetchAllPackages = async () => {
    try {
      const packagesCollection = collection(db, 'packages');
      const packagesSnapshot = await getDocs(packagesCollection);
      
      const allScans: ScanData[] = [];
      packagesSnapshot.forEach(doc => {
        allScans.push(doc.data() as ScanData);
      });
      
      return allScans;
    } catch (error) {
      console.error('Error fetching packages data:', error);
      return [] as ScanData[];
    }
  };

  // Effect for carrier share chart - runs when shareTimeframe changes
  useEffect(() => {
    loadCarrierShareData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareTimeframe]); // loadCarrierShareData depends on shareTimeframe, but we don't want to include it in deps
  
  // Effect for time chart - runs when timeRange changes
  useEffect(() => {
    loadTimeChartData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]); // loadTimeChartData depends on timeRange, but we don't want to include it in deps

  // Function to get a color for a carrier
  const getCarrierColor = (carrier: string) => {
    return CARRIER_COLORS[carrier] || 
      DEFAULT_COLORS[Object.keys(CARRIER_COLORS).length % DEFAULT_COLORS.length];
  };

  // No custom type needed - we'll use inline types

  // Get all unique carriers from the time chart data
  const getUniqueCarriers = () => {
    const carriers = new Set<string>();
    timeChartData.forEach(day => {
      Object.keys(day).forEach(key => {
        if (key !== 'date' && typeof day[key] === 'number') {
          carriers.add(key);
        }
      });
    });
    return Array.from(carriers);
  };

  // Function to manually refresh all chart data if needed
  const refreshAllChartData = () => {
    // Reset timestamps
    setTimeChartLastUpdated(null);
    setShareChartLastUpdated(null);
    
    // Trigger data reload
    loadTimeChartData();
    loadCarrierShareData();
  };

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Visual Trends</h2>
        <div className="flex items-center">
          <div className="flex items-center mr-3 text-green-600 text-xs font-medium">
            <span className="relative flex h-2 w-2 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Real-time Updates
          </div>
          <button 
            onClick={refreshAllChartData}
            className="px-3 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Manual Refresh
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scans Over Time Chart */}
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-md font-medium text-gray-700">Scans Over Time</h3>
            <div className="flex space-x-1">
              <button
                onClick={() => setTimeRange('daily')}
                disabled={isTimeChartLoading}
                className={`px-3 py-1 text-xs font-medium rounded-md flex items-center ${
                  timeRange === 'daily'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {isTimeChartLoading && timeRange === 'daily' && (
                  <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                Daily
              </button>
              <button
                onClick={() => setTimeRange('monthly')}
                disabled={isTimeChartLoading}
                className={`px-3 py-1 text-xs font-medium rounded-md flex items-center ${
                  timeRange === 'monthly'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {isTimeChartLoading && timeRange === 'monthly' && (
                  <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                Monthly
              </button>
            </div>
          </div>
          {timeChartLastUpdated && (
            <div className="text-xs text-gray-400 mb-2 text-right">
              Last updated: {format(timeChartLastUpdated, "MMM d, yyyy 'at' h:mm a")}
            </div>
          )}
          
          {isTimeChartLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading chart data...</div>
            </div>
          ) : timeChartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center flex-col">
              <div className="text-gray-400">No scan data available</div>
              <p className="text-sm text-gray-400 mt-2">
                Try scanning some packages to see data here
              </p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={timeChartData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {getUniqueCarriers().map((carrier) => (
                    <Line
                      key={carrier}
                      type="monotone"
                      dataKey={carrier}
                      stroke={getCarrierColor(carrier)}
                      activeDot={{ r: 8 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        
        {/* Carrier Share Chart */}
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-md font-medium text-gray-700">Carrier Share</h3>
            <div className="flex space-x-1">
              <button
                onClick={() => setShareTimeframe('today')}
                disabled={isShareChartLoading}
                className={`px-3 py-1 text-xs font-medium rounded-md flex items-center ${
                  shareTimeframe === 'today'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {isShareChartLoading && shareTimeframe === 'today' && (
                  <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                Today
              </button>
              <button
                onClick={() => setShareTimeframe('month')}
                disabled={isShareChartLoading}
                className={`px-3 py-1 text-xs font-medium rounded-md flex items-center ${
                  shareTimeframe === 'month'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {isShareChartLoading && shareTimeframe === 'month' && (
                  <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                This Month
              </button>
            </div>
          </div>
          {shareChartLastUpdated && (
            <div className="text-xs text-gray-400 mb-2 text-right">
              Last updated: {format(shareChartLastUpdated, "MMM d, yyyy 'at' h:mm a")}
            </div>
          )}
          
          {isShareChartLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-pulse text-gray-400">Loading chart data...</div>
            </div>
          ) : carrierShareData.length === 0 ? (
            <div className="h-64 flex items-center justify-center flex-col">
              <div className="text-gray-400">No carrier data available</div>
              <p className="text-sm text-gray-400 mt-2">
                Try scanning some packages to see data here
              </p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={carrierShareData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {carrierShareData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={getCarrierColor(entry.name)} 
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 shadow rounded border border-gray-100">
                            <p className="font-medium">{data.name}</p>
                            <p className="text-sm">Scans: {data.value}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChartsSection;