import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { db } from '@/config/firebase'
import { collection, deleteDoc, getDocs } from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import DashboardHeader from '../components/DashboardHeader'
import KpiSummaryRow from '../components/KpiSummaryRow'
import { Button } from '../components/ui/button'
import { useAuth } from '../contexts/useAuth'
import { useFirestoreSearchWithServerSidePagination, type SearchFilter } from './useFirestoreSearchWithServerSidePagination'

const Home = () => {
  const { user, logout } = useAuth();
  const [availableCarriers, setAvailableCarriers] = useState<string[]>([]);

  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("all"); // Initialize with "all" instead of empty string
  
  // State for the delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState(false);

  // 👇 Build dynamic filters based on input values
  const filters = [];
  if (tracking) filters.push({ field: "tracking", op: "startsWith", value: tracking });
  // Only add carrier filter if it's not the "all" value
  if (carrier && carrier !== "all") filters.push({ field: "carrier", op: "==", value: carrier });


const {
    data: packages,
    loading,
    error,
    page,
    totalPages,
    totalCount,
    hasPrev,
    hasNext,
    prevPage,
    nextPage,
    goToPage,
    reset,
  } = useFirestoreSearchWithServerSidePagination<{
    tracking: string;
    carrier: string;
    timestamp: string;
  }>(
    db,
    "packages",
    {
      pageSize: 50,
      filters: filters as SearchFilter[],
      withTotalCount: true,
    }
  );


   const fetchAllCarriers = useCallback(async () => {
      try {
        const packagesCollection = collection(db, 'packages');
        const packagesSnapshot = await getDocs(packagesCollection);
        
        const carriers = new Set<string>();
        
        packagesSnapshot.forEach(doc => {
          const data = doc.data();
  
          // Extract carrier name
          let carrierName: string;
          if (typeof data.carrier === 'string') {
            carrierName = data.carrier;
          } else if (data.carrier && typeof data.carrier === 'object') {
            carrierName = (data.carrier as { name?: string }).name || 'Unknown';
          } else {
            carrierName = 'Unknown';
          }
          
          carriers.add(carrierName);
        });
        
        setAvailableCarriers(Array.from(carriers).sort());
      } catch (err) {
        console.error('Error fetching carriers:', err);
      }
    }, []);


  useEffect(() => {
    const t = setTimeout(() => reset(), 500); // wait 500ms after typing
    return () => clearTimeout(t);
  }, [tracking, carrier, reset]);

  useEffect(() => {
    fetchAllCarriers();
  }, [fetchAllCarriers]);


  const pagesToShow = 5; // windowed buttons
  const start = Math.max(1, page - Math.floor(pagesToShow / 2));
  const end = totalPages ? Math.min(totalPages, start + pagesToShow - 1) : start;

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };
  
  const handleDeleteByDateRange = async () => {
    // Validate that both dates are selected
    if (!startDate || !endDate) {
      toast('Please select both start and end dates');
      return;
    }
    
    // Validate that end date is not before start date
    if (endDate < startDate) {
      toast('End date cannot be before start date');
      return;
    }
    
    // Validate that the date range is not too large (e.g. more than 90 days)
    const dayDifference = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));
    if (dayDifference > 90) {
      toast('Date range cannot exceed 90 days for safety reasons');
      return;
    }
    
    
    try {
      setIsDeleting(true);

      // Format dates to Firestore timestamp format (start of day for startDate, end of day for endDate)
      const startTimestamp = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate()
      ).toISOString();

      const endDateCopy = new Date(endDate);
      endDateCopy.setHours(23, 59, 59, 999);
      const endTimestamp = endDateCopy.toISOString();

      // Create a query to get packages within the date range
      const packagesRef = collection(db, 'packages');
      const packagesSnapshot = await getDocs(packagesRef);

      // Track deleted count for user feedback
      let deletedCount = 0;

      // Process each document
      for (const doc of packagesSnapshot.docs) {
        const packageData = doc.data();
        
        // Check if the package timestamp is within our range
        if (packageData.timestamp >= startTimestamp && 
            packageData.timestamp <= endTimestamp) {
          await deleteDoc(doc.ref);
          deletedCount++;
        }
      }

      toast.success(`Successfully deleted ${deletedCount} packages`);
      
      // Close the modal after successful deletion
      setShowDeleteModal(false);
      
      // Reset the form
      setStartDate(undefined);
      setEndDate(undefined);
      
      // Refresh the data
      reset();
    } catch (error) {
      toast(`Error deleting packages: ${error}`);
    } finally {
      setIsDeleting(false);
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
      {/* <ChartsSection /> */}
      
   

  <h2 className="text-xl font-semibold mb-3">Recent Packages</h2>
      <div className="flex flex-col space-y-4 mb-6 bg-white p-6 rounded-lg shadow-md">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Tracking input */}
          <div className="col-span-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              <Input
                id="tracking-search"
                placeholder="Search tracking number"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          {/* Carrier select */}
          <div className="col-span-1">
            <Select 
              value={carrier} 
              onValueChange={(value) => {
                console.log("Selected carrier:", value);
                setCarrier(value);
              }}
            >
              <SelectTrigger className="w-full h-[38px]" id="carrier-select">
                <SelectValue placeholder="All Carriers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Carriers</SelectItem>
                {availableCarriers.map((carrierName) => (
                  <SelectItem key={carrierName} value={carrierName}>
                    {carrierName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Delete by range button */}
          <div className="col-span-1 flex items-end">
            <Button 
              variant="destructive" 
              className="w-full flex items-center justify-center"
              onClick={() => setShowDeleteModal(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Delete by Date Range
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Modal using shadcn Dialog */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Packages by Date Range</DialogTitle>
            <DialogDescription>
              Select a date range to permanently delete package data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <DatePicker
              date={startDate}
              setDate={setStartDate}
              label="Start Date"
              placeholder="Select start date"
            />
            
            <DatePicker
              date={endDate}
              setDate={setEndDate}
              label="End Date"
              placeholder="Select end date"
            />
            
            <div className="flex flex-col space-y-2">
              <p className="text-sm text-red-500 font-medium">Warning: This action cannot be undone</p>
              <p className="text-xs text-gray-500">All packages within the selected date range will be permanently deleted.</p>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteByDateRange}
              disabled={!startDate || !endDate || isDeleting}
            >
              {isDeleting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Deleting...
                </>
              ) : (
                'Delete Packages'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

  <div className="overflow-x-auto rounded-lg shadow-md">
    <table className="min-w-full bg-white">
      <thead className="bg-gray-100">
        <tr>
          <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 uppercase tracking-wider">#</th>
          <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 uppercase tracking-wider">Tracking Number</th>
          <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 uppercase tracking-wider">Carrier</th>
          <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 uppercase tracking-wider">Timestamp</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {error && (
          <tr>
            <td colSpan={4} className="py-4 px-4 text-center text-sm text-red-500">
              Error: {error}
            </td>
          </tr>
        )}
        {!loading && !error && packages.length === 0 && (
          <tr>
            <td colSpan={4} className="py-4 px-4 text-center text-sm text-gray-500">
              No packages found
            </td>
          </tr>
        )}
        {loading ?   <tr>
            <td colSpan={4} className="py-4 px-4 text-center text-sm text-gray-500">
              Loading...
            </td>
          </tr> : packages.map((pkg, index) => (
          <tr key={index} className="hover:bg-gray-50">
            <td className="py-3 px-4 text-sm text-gray-900">{index + 1 + (page - 1) * 10}</td>
            <td className="py-3 px-4 text-sm text-gray-900">{pkg.tracking}</td>
            <td className="py-3 px-4 text-sm text-gray-900">{pkg.carrier}</td>
            <td className="py-3 px-4 text-sm text-gray-900">{pkg.timestamp}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  
  <div className="mt-4 flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 rounded-b-lg">
    <div className="text-sm text-gray-700">
      Showing <span className="font-medium">{packages.length ? (page - 1) * 10 + 1 : 0}</span> to{" "}
      <span className="font-medium">{(page - 1) * 10 + packages.length}</span> of{" "}
      <span className="font-medium">{totalCount || 0}</span> results
    </div>
    <div className="flex items-center space-x-2">
      <button
        onClick={prevPage}
        disabled={!hasPrev}
        className={`relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
          hasPrev 
            ? "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300" 
            : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
        }`}
        aria-label="Previous page"
      >
        <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Previous
      </button>
      
      <div className="hidden md:flex space-x-1">
        {totalPages &&
          Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) => (
            <button
              key={p}
              onClick={() => goToPage(p)}
              disabled={p === page}
              className={`relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                p === page
                  ? "z-10 bg-indigo-50 border-indigo-500 text-indigo-600 border"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50 border"
              }`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          ))}
      </div>
      
      <button
        onClick={nextPage}
        disabled={!hasNext}
        className={`relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
          hasNext 
            ? "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300" 
            : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
        }`}
        aria-label="Next page"
      >
        Next
        <svg className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  </div>

      
    </div>
  )
}

export default Home

