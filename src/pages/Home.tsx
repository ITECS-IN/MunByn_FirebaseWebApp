import { useState } from 'react'
import { useAuth } from '../contexts/useAuth'
import { Button } from '../components/ui/button'
import DashboardHeader from '../components/DashboardHeader'
import TrackingTable from '../components/TrackingTable'
import KpiSummaryRow from '../components/KpiSummaryRow'
import ChartsSection from '../components/ChartsSection'
import { testFirestoreData } from '../utils/debugFirestore'

const Home = () => {
  const { user, logout } = useAuth();
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugResults, setDebugResults] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };
  
  const handleTestFirestore = async () => {
    setIsLoading(true);
    setDebugResults(null);
    try {
      const data = await testFirestoreData();
      setDebugResults(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error testing Firestore:', error);
      setDebugResults(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      
      {/* Welcome section */}
      <div className="mb-6 bg-white p-6 rounded-lg shadow-md">
        <p className="text-gray-600">
          Hello, {user?.name || user?.email || 'User'}! This is your device tracking dashboard.
        </p>

        <div className="mt-4">
          <Button 
            variant="outline" 
            onClick={handleLogout}
          >
            Sign Out
          </Button>
        </div>
      </div>
      {/* Dashboard Header with filters and controls */}
      <DashboardHeader />
      
      {/* KPI Summary Row */}
      <KpiSummaryRow />
      
      {/* Charts Section */}
      <ChartsSection />
      
      {/* Recent Shipments Table - To be implemented later */}
      <TrackingTable/>
      
      {/* Debug Panel - only visible in development */}
      {import.meta.env.DEV && (
        <div className="mt-8 mb-8">
          <div className="flex items-center mb-4">
            <button
              onClick={() => setDebugVisible(!debugVisible)}
              className="text-gray-700 hover:text-indigo-600 focus:outline-none mr-2"
            >
              <span className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  {debugVisible ? (
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  ) : (
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  )}
                </svg>
                Debug Tools {debugVisible ? '(Hide)' : '(Show)'}
              </span>
            </button>
            <div className="text-xs text-gray-500">(Development mode only)</div>
          </div>
          
          {debugVisible && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-gray-800 mb-4">Firebase Firestore Debug</h3>
              
              <div className="mb-4">
                <Button
                  onClick={handleTestFirestore}
                  disabled={isLoading}
                  className="mr-2"
                >
                  {isLoading ? 'Testing...' : 'Test Firestore Data Retrieval'}
                </Button>
              </div>
              
              {debugResults && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Results:</h4>
                  <pre className="bg-gray-100 p-4 rounded-md text-xs overflow-auto max-h-96">
                    {debugResults}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
    </div>
  )
}

export default Home