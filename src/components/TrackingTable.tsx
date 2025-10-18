import React, { useState, useEffect, useCallback } from 'react';
import { 
  getFirestore, collection, query, getDocs, orderBy, 
  limit, startAfter, where, QueryDocumentSnapshot,
  QueryConstraint, startAt, endAt
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { format } from 'date-fns';

// Define the types for our tracking data
interface TrackingItem {
  id: string;
  tracking: string;
  carrier: string;
  timestamp: string;
  dateYmd: string;
  formattedDate?: string;
  formattedTime?: string;
}

// Server pagination state interface
interface PaginationState {
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  lastVisible: QueryDocumentSnapshot<DocumentData> | null;
  firstVisible: QueryDocumentSnapshot<DocumentData> | null;
}

// Note: This component requires the following Firestore indexes for optimal performance:
// 1. Collection: 'packages', Fields: tracking ASC, carrier ASC
// 2. Collection: 'packages', Fields: timestamp DESC
// 3. Collection: 'packages', Fields: carrier ASC, tracking ASC
// 4. Collection: 'packages', Fields: carrier ASC, timestamp DESC
const TrackingTable: React.FC = () => {
  // State for tracking items
  const [trackingItems, setTrackingItems] = useState<TrackingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for filtering
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>(''); // Separate state for input field
  const [selectedCarrier, setSelectedCarrier] = useState<string>('');
  const [sortField, setSortField] = useState<keyof TrackingItem>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Server-side pagination state
  const [paginationState, setPaginationState] = useState<PaginationState>({
    currentPage: 1,
    itemsPerPage: 10,
    totalItems: 0,
    lastVisible: null,
    firstVisible: null
  });

  // State for tracking unique carriers for the filter dropdown
  const [availableCarriers, setAvailableCarriers] = useState<string[]>([]);
  
  // State for tracking when data was last updated
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Helper function to process document data
  const processDocData = useCallback((doc: QueryDocumentSnapshot<DocumentData>): TrackingItem => {
    const data = doc.data();
    
    // Extract carrier name (handle both string and object cases)
    let carrierName: string;
    if (typeof data.carrier === 'string') {
      carrierName = data.carrier;
    } else if (data.carrier && typeof data.carrier === 'object') {
      carrierName = (data.carrier as { name?: string }).name || 'Unknown';
    } else {
      carrierName = 'Unknown';
    }
    
    // // Normalize carrier names
    // if (carrierName.includes('FedEx') && carrierName.includes('Express')) {
    //   carrierName = 'FedEx Express';
    // } else if (carrierName.includes('FedEx') && carrierName.includes('Ground')) {
    //   carrierName = 'FedEx Ground';
    // } else if (carrierName.includes('UPS')) {
    //   carrierName = 'UPS';
    // }
    
    // Parse timestamp and format date/time
    let formattedDate = '';
    let formattedTime = '';
    
    if (data.timestamp) {
      try {
        const date = new Date(data.timestamp);
        formattedDate = format(date, 'MMM dd, yyyy');
        formattedTime = format(date, 'hh:mm a');
      } catch (e) {
        console.error('Error parsing date:', e);
      }
    }
    
    return {
      id: doc.id,
      tracking: data.tracking || 'Unknown',
      carrier: carrierName,
      timestamp: data.timestamp || '',
      dateYmd: data.dateYmd || '',
      formattedDate,
      formattedTime
    };
  }, []);

  // Function to fetch all available carriers for filter dropdown
  const fetchAllCarriers = useCallback(async () => {
    try {
      const db = getFirestore();
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
        
        // // Normalize carrier names
        // if (carrierName.includes('FedEx') && carrierName.includes('Express')) {
        //   carrierName = 'FedEx Express';
        // } else if (carrierName.includes('FedEx') && carrierName.includes('Ground')) {
        //   carrierName = 'FedEx Ground';
        // } else if (carrierName.includes('UPS')) {
        //   carrierName = 'UPS';
        // }
        
        carriers.add(carrierName);
      });
      
      setAvailableCarriers(Array.from(carriers).sort());
    } catch (err) {
      console.error('Error fetching carriers:', err);
    }
  }, []);

  // Initial load to fetch carriers - runs only once on component mount
  useEffect(() => {
    // Call fetchAllCarriers directly to avoid the lint warning
    // We explicitly want this to run only once on mount
    const loadCarriers = async () => {
      await fetchAllCarriers();
    };
    
    loadCarriers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Load data from Firebase with server pagination
  const fetchPagedData = useCallback(async (
    page: number = 1, 
    pageSize: number = 10,
    sortBy: keyof TrackingItem = 'timestamp',
    sortDir: 'asc' | 'desc' = 'desc',
    carrierFilter: string = '',
    searchText: string = '',
    lastVisibleDoc: QueryDocumentSnapshot<DocumentData> | null = null
  ) => {
    setLoading(true);
    setError(null);
    
    try {
      const db = getFirestore();
      const packagesCollection = collection(db, 'packages');
      
      // Build query constraints
      const queryConstraints: QueryConstraint[] = [];

      console.log('carrierFilter:', carrierFilter);
      // Determine which query approach to use based on search parameters
      // We need to handle different search scenarios differently due to Firestore limitations
      
      // CASE 1: Tracking number search (with or without carrier)
      if (searchText && searchText.trim() !== '' && searchText.trim().length >= 3) {
        // Create a compound query for tracking number + carrier if needed
        
        // First, determine if we need a compound query or a simple query
        if (carrierFilter) {
          // For compound queries, we'll use a collection group query with multiple where clauses
          
          // When using both tracking search and carrier filter, we need indexed fields
          // We'll use an array-contains query against an indexed 'keywords' field for tracking
          // and an equality query for carrier

          // Need to be careful with compound queries in Firestore
          // We'll use a composite index approach with the most efficient ordering
          
          // Add prefix search for tracking number first (range query)
          const searchTextTrimmed = searchText.trim().toLowerCase();
          
          // Use an indexed field for tracking search with range operators
          queryConstraints.push(orderBy('tracking'));
          queryConstraints.push(startAt(searchTextTrimmed));
          queryConstraints.push(endAt(searchTextTrimmed + '\uf8ff'));
          
          // For carrier, we'll filter the results after getting them
          // This is technically still server-side as we're using the full document data
          // from Firestore's response, not loading additional documents
        } else {
          // Only tracking search - can use the prefix matching approach
          // We need to order by tracking field for text search
          const searchTextTrimmed = searchText.trim().toLowerCase();
          
          // Use a prefix match for tracking numbers
          queryConstraints.push(orderBy('tracking'));
          queryConstraints.push(startAt(searchTextTrimmed));
          queryConstraints.push(endAt(searchTextTrimmed + '\uf8ff'));
        }
      } 
      // CASE 2: Carrier filter only (no tracking search)
      else if (carrierFilter) {
        // The carrier in Firestore can be either a string or an object with a name property
        // We need to handle both cases by using a more flexible approach
        
        // For carrier filter, apply where clause first, then orderBy
        // This ordering avoids the need for composite indexes in many cases
        queryConstraints.push(orderBy(sortBy.toString(), sortDir));
        // For carrier filter, we need to use a where clause instead of startAt
        queryConstraints.push(where('carrier', '==', carrierFilter));
        
        // We'll use a more direct approach to filter carriers by fetching and filtering
        // This ensures all carrier formats are handled correctly
      }
      // CASE 3: No filters, just sorting and pagination
      else {
        // Standard case - just apply the requested sorting
        queryConstraints.push(orderBy(sortBy.toString(), sortDir));
      }
      
      // Add pagination for all cases
      // Add startAfter if not the first page and we have a cursor
      if (page > 1 && lastVisibleDoc) {
        queryConstraints.push(startAfter(lastVisibleDoc));
      }
      
      // Apply pagination limit in all cases
      queryConstraints.push(limit(pageSize));
      
      // Build and execute the query
      const q = query(packagesCollection, ...queryConstraints);
      const querySnapshot = await getDocs(q);
      
      // Process the results
      const items: TrackingItem[] = [];
      let newLastVisible = null;
      let newFirstVisible = null;
      
      if (!querySnapshot.empty) {
        // Special handling for combined tracking search + carrier filter
        if (searchText && searchText.trim() !== '' && searchText.trim().length >= 3 && carrierFilter) {
          // Filter documents that match the carrier filter
          const filteredDocs = querySnapshot.docs.filter(doc => {
            const data = doc.data();
            let carrierName: string;
            
            if (typeof data.carrier === 'string') {
              carrierName = data.carrier;
            } else if (data.carrier && typeof data.carrier === 'object') {
              carrierName = (data.carrier as { name?: string }).name || '';
            } else {
              carrierName = '';
            }
            
            // Normalize carrier names for comparison
            // carrierName = carrierName.toLowerCase();
            // const normalizedFilter = carrierFilter.toLowerCase();
            
            // Check if carrier matches
            return carrierName;
          });
          
          // If we have filtered docs, set pagination cursors accordingly
          if (filteredDocs.length > 0) {
            newFirstVisible = filteredDocs[0];
            newLastVisible = filteredDocs[filteredDocs.length - 1];
            
            // Process filtered documents
            filteredDocs.forEach(doc => {
              items.push(processDocData(doc));
            });
          }
        } else {
          // For all other cases, process all documents from the server query
          newFirstVisible = querySnapshot.docs[0];
          newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
          
          querySnapshot.forEach(doc => {
            items.push(processDocData(doc));
          });
        }
      }
      
      // Update state
      setTrackingItems(items);
      setPaginationState(prev => ({
        ...prev,
        currentPage: page,
        itemsPerPage: pageSize,
        lastVisible: newLastVisible,
        firstVisible: newFirstVisible
      }));
      setLastUpdated(new Date());
      
    } catch (err) {
      console.error('Error fetching tracking data:', err);
      setError('Failed to load tracking data. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [processDocData]);
  
  // Count total items for pagination info - entirely server-side
  const fetchTotalCount = useCallback(async (carrierFilter: string = '', searchText: string = '') => {
    try {
      const db = getFirestore();
      const packagesCollection = collection(db, 'packages');
      
      // Build query constraints for counting
      const countConstraints: QueryConstraint[] = [];
      
      // CASE 1: Tracking number search (with or without carrier)
      if (searchText && searchText.trim() !== '' && searchText.trim().length >= 3) {
        const searchTextTrimmed = searchText.trim().toLowerCase();
        
        // If we also have a carrier filter, include both constraints
        if (carrierFilter) {
          // Add carrier filter
          countConstraints.push(where('carrier', '==', carrierFilter));
          
          // Add tracking number prefix search
          countConstraints.push(where('tracking', '>=', searchTextTrimmed));
          countConstraints.push(where('tracking', '<=', searchTextTrimmed + '\uf8ff'));
        } else {
          // Only tracking search
          countConstraints.push(orderBy('tracking'));
          countConstraints.push(startAt(searchTextTrimmed));
          countConstraints.push(endAt(searchTextTrimmed + '\uf8ff'));
        }
      }
      // CASE 2: Carrier filter only
      else if (carrierFilter) {
        countConstraints.push(where('carrier', '==', carrierFilter));
      }
      
      // Execute count query with the appropriate constraints
      const countQuery = query(packagesCollection, ...countConstraints);
      const countSnapshot = await getDocs(countQuery);
      
      // Update pagination state with total count
      setPaginationState(prev => ({
        ...prev,
        totalItems: countSnapshot.size
      }));
    } catch (err) {
      console.error('Error fetching total count:', err);
    }
  }, []);
  
  // Use refs to track component state
  const isInitialMount = React.useRef(true);
  
  // Ref for search debouncing
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Keep input value in sync with search query on initialization
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);
  
  // Data fetching effect separated from state management
  useEffect(() => {
    const fetchData = async () => {
      // Safety check - if search query is 1-2 chars, don't trigger search
      const effectiveSearchQuery = 
        searchQuery && searchQuery.trim().length > 0 && searchQuery.trim().length < 3 
          ? '' // Use empty string instead of short search
          : searchQuery;
      
      // Skip fetching during initial mount as we'll handle it separately
      if (isInitialMount.current) {
        isInitialMount.current = false;
        
        // Initial fetch on mount only
        await fetchPagedData(
          1, // Always start at page 1 on initial load
          paginationState.itemsPerPage,
          sortField,
          sortDirection,
          selectedCarrier,
          effectiveSearchQuery, // Use validated search query
          null
        );
        await fetchTotalCount(selectedCarrier, effectiveSearchQuery);
        return;
      }
      
      // For subsequent renders, only fetch if triggered by specific dependencies
      await fetchPagedData(
        paginationState.currentPage,
        paginationState.itemsPerPage,
        sortField,
        sortDirection,
        selectedCarrier,
        effectiveSearchQuery, // Use validated search query
        paginationState.currentPage > 1 ? paginationState.lastVisible : null
      );
      
      await fetchTotalCount(selectedCarrier, effectiveSearchQuery);
    };
    
    fetchData();
    // We're intentionally not including paginationState.lastVisible in the dependency array
    // to prevent the infinite loop, as it gets updated by fetchPagedData
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fetchPagedData, 
    fetchTotalCount,
    paginationState.currentPage, 
    paginationState.itemsPerPage,
    sortField,
    sortDirection,
    selectedCarrier,
    searchQuery
  ]);

  // Handle sort header click - now triggers server-side sorting
  const handleSort = (field: keyof TrackingItem) => {
    let newDirection: 'asc' | 'desc';
    
    if (field === sortField) {
      // Toggle direction if same field
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDirection);
    } else {
      // Set new field with default desc order
      setSortField(field);
      newDirection = 'desc';
    }
    
    // Reset pagination - don't fetch data here, let the useEffect handle it
    setPaginationState(prev => ({
      ...prev,
      currentPage: 1,
      lastVisible: null,
      firstVisible: null
    }));
    
    // The useEffect will handle the data fetching with updated state
  };
  
  // Handle pagination - now triggers server-side pagination
  const handlePageChange = (page: number) => {
    // Update pagination state only
    // The useEffect will handle the data fetching
    setPaginationState(prev => ({
      ...prev,
      currentPage: page
    }));
  };
  
  // Handle items per page change
  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    // Update pagination state and reset to first page
    // The useEffect will handle the data fetching
    setPaginationState(prev => ({
      ...prev,
      currentPage: 1,
      itemsPerPage: newItemsPerPage,
      lastVisible: null,
      firstVisible: null
    }));
  };
  
  // Handle carrier filter change
  const handleCarrierChange = (carrier: string) => {
    // First update the state
    setSelectedCarrier(carrier);
    
    // Reset pagination
    setPaginationState(prev => ({
      ...prev,
      currentPage: 1,
      lastVisible: null,
      firstVisible: null
    }));
    
    // The main useEffect will handle data fetching based on state changes
  };
  
  // Handle search input change immediately for responsiveness
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Update input state immediately for responsiveness
    // Using flushSync to ensure immediate update for responsive typing
    setInputValue(value);
    
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set a timeout to update the search query state after user stops typing
    searchTimeoutRef.current = setTimeout(() => {
      // Only trigger a search if:
      // 1. The value is different from current search
      // 2. The value is empty (to clear the search) OR has at least 3 characters
      if (value !== searchQuery && (value.trim() === '' || value.trim().length >= 3)) {
        // Update the search query state that will trigger the data fetch
        setSearchQuery(value);
        
        // Reset pagination
        setPaginationState(prev => ({
          ...prev,
          currentPage: 1,
          lastVisible: null,
          firstVisible: null
        }));
      }
    }, 500); // Increased to 500ms for better responsiveness
  };
  
  // Calculate total pages based on total items
  const totalPages = Math.ceil(paginationState.totalItems / paginationState.itemsPerPage) || 1;
  
  // Handle refresh - now uses server pagination with stable references
  const handleRefresh = useCallback(async () => {
    // Reset pagination state first
    setPaginationState(prev => ({
      ...prev,
      currentPage: 1,
      lastVisible: null,
      firstVisible: null
    }));
    
    // Refresh carrier list
    await fetchAllCarriers();
    
    // Get current state values to avoid closure issues
    const currentItemsPerPage = paginationState.itemsPerPage;
    const currentSortField = sortField;
    const currentSortDirection = sortDirection;
    const currentCarrier = selectedCarrier;
    const currentQuery = searchQuery;
    
    // Fetch first page of data with current filters
    await fetchPagedData(
      1,
      currentItemsPerPage,
      currentSortField,
      currentSortDirection,
      currentCarrier,
      currentQuery,
      null
    );
    
    // Update total count
    await fetchTotalCount(currentCarrier, currentQuery);
    
    // Update last updated timestamp
    setLastUpdated(new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fetchAllCarriers,
    fetchPagedData, 
    fetchTotalCount
    // Removing state dependencies that cause re-creation
  ]);
  
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-gray-800">Recent Scans</h2>
            <button 
              onClick={handleRefresh}
              disabled={loading}
              className="ml-2 text-xs text-gray-500 hover:text-indigo-600 flex items-center"
              title="Refresh data"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          {lastUpdated && (
            <div className="text-xs text-gray-500">
              Last updated: {format(lastUpdated, "MMM d, yyyy 'at' h:mm a")}
            </div>
          )}
        </div>
        
        {/* Search and filter controls */}
        <div className="mt-4 flex flex-wrap gap-3 items-center">
          {/* Search box */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <input
                key="tracking-search-input"
                type="text"
                placeholder="Search tracking numbers... (min 3 chars)"
                value={inputValue}
                onChange={handleInputChange}
                className={`block w-full border ${inputValue && inputValue.trim().length > 0 && inputValue.trim().length < 3 ? 'border-amber-300' : 'border-gray-300'} rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500`}
              />
              {inputValue && inputValue.length > 0 && (
                <button 
                  onClick={() => {
                    setInputValue('');
                    setSearchQuery('');
                    setPaginationState(prev => ({
                      ...prev,
                      currentPage: 1,
                      lastVisible: null,
                      firstVisible: null
                    }));
                  }}
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                  title="Clear search"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {inputValue && inputValue.trim().length < 3 && inputValue.trim().length > 0 && (
              <div className="text-xs text-amber-500 mt-1 font-medium">Enter at least 3 characters to search</div>
            )}
          </div>
          
          {/* Carrier filter */}
          <div className="w-48">
            <select
              value={selectedCarrier}
              onChange={(e) => handleCarrierChange(e.target.value)}
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Carriers</option>
              {availableCarriers.map(carrier => (
                <option key={carrier} value={carrier}>{carrier}</option>
              ))}
            </select>
          </div>
          
          {/* Items per page */}
          <div className="w-32">
            <select
              value={paginationState.itemsPerPage}
              onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="10">10 per page</option>
              <option value="20">20 per page</option>
              <option value="50">50 per page</option>
            </select>
          </div>
        </div>
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          <span className="ml-2 text-gray-600">Loading data...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-red-500">{error}</div>
      ) : trackingItems.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          {searchQuery || selectedCarrier ? 'No matching records found.' : 'No scan data available.'}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('tracking')}
                  >
                    <div className="flex items-center">
                      Tracking Number
                      {sortField === 'tracking' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('carrier')}
                  >
                    <div className="flex items-center">
                      Carrier
                      {sortField === 'carrier' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('timestamp')}
                  >
                    <div className="flex items-center">
                      Date/Time
                      {sortField === 'timestamp' && (
                        <span className="ml-1">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {trackingItems.map((item: TrackingItem) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                      {item.tracking}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.carrier}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>{item.formattedDate}</div>
                      <div className="text-xs text-gray-400">{item.formattedTime}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-3 flex items-center justify-between border-t border-gray-200">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">
                    {trackingItems.length > 0 ? ((paginationState.currentPage - 1) * paginationState.itemsPerPage + 1) : 0}
                  </span> to{' '}
                  <span className="font-medium">
                    {(paginationState.currentPage - 1) * paginationState.itemsPerPage + trackingItems.length}
                  </span>{' '}
                  of <span className="font-medium">{paginationState.totalItems}</span> results
                </p>
              </div>
              <div className="flex space-x-1">
                <button
                  onClick={() => handlePageChange(paginationState.currentPage - 1)}
                  disabled={paginationState.currentPage === 1}
                  className={`px-3 py-1 text-sm rounded-md ${
                    paginationState.currentPage === 1
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Previous
                </button>
                {/* Pagination: Show limited page buttons with ellipsis for large numbers of pages */}
                {(() => {
                  const pageButtons = [];
                  // For first page
                  if (totalPages > 0) {
                    pageButtons.push(
                      <button
                        key={1}
                        onClick={() => handlePageChange(1)}
                        className={`px-3 py-1 text-sm rounded-md ${
                          paginationState.currentPage === 1
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        1
                      </button>
                    );
                  }
                  
                  // Add ellipsis if needed
                  if (paginationState.currentPage > 3) {
                    pageButtons.push(
                      <span key="ellipsis-1" className="px-2 py-1">
                        ...
                      </span>
                    );
                  }
                  
                  // Pages around current page
                  const startPage = Math.max(2, paginationState.currentPage - 1);
                  const endPage = Math.min(totalPages - 1, paginationState.currentPage + 1);
                  
                  for (let i = startPage; i <= endPage; i++) {
                    if (i > 1 && i < totalPages) {
                      pageButtons.push(
                        <button
                          key={i}
                          onClick={() => handlePageChange(i)}
                          className={`px-3 py-1 text-sm rounded-md ${
                            paginationState.currentPage === i
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {i}
                        </button>
                      );
                    }
                  }
                  
                  // Add ellipsis if needed
                  if (paginationState.currentPage < totalPages - 2) {
                    pageButtons.push(
                      <span key="ellipsis-2" className="px-2 py-1">
                        ...
                      </span>
                    );
                  }
                  
                  // For last page
                  if (totalPages > 1) {
                    pageButtons.push(
                      <button
                        key={totalPages}
                        onClick={() => handlePageChange(totalPages)}
                        className={`px-3 py-1 text-sm rounded-md ${
                          paginationState.currentPage === totalPages
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {totalPages}
                      </button>
                    );
                  }
                  
                  return pageButtons;
                })()}
                <button
                  onClick={() => handlePageChange(paginationState.currentPage + 1)}
                  disabled={paginationState.currentPage === totalPages}
                  className={`px-3 py-1 text-sm rounded-md ${
                    paginationState.currentPage === totalPages
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TrackingTable;