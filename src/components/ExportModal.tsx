import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { getFirestore, collection, query, getDocs, where, orderBy, QueryConstraint } from 'firebase/firestore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from './ui/dialog';
import { DateRangePicker } from './ui/date-picker-range';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { getDeviceLabel } from '../config/deviceLabels';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  // State for date range picker
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null
  });

  // State for carrier filter
  const [selectedCarrier, setSelectedCarrier] = useState<string>("all_carriers");
  
  // State for available carriers
  const [availableCarriers, setAvailableCarriers] = useState<string[]>([]);
  
  // Error state for validation
  const [errors, setErrors] = useState<{
    dateRange?: string;
  }>({});
  
  // Loading state
  const [loading, setLoading] = useState<boolean>(false);
  
  // Function to handle date range changes
  // Now handled directly by DateRangePicker component
  
  // Function to handle carrier filter changes
  const handleCarrierChange = (value: string) => {
    setSelectedCarrier(value);
  };
  
  // Function to fetch all available carriers for filter dropdown
  const fetchAllCarriers = async () => {
    try {
      const db = getFirestore();
      const packagesCollection = collection(db, 'packages');
      const packagesSnapshot = await getDocs(packagesCollection);
      
      const carriers = new Set<string>();
      const rawCarriers = new Set<string>();
      
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
        
        // Store the exact carrier name as it appears in the database
        rawCarriers.add(carrierName);
        
        // Also extract base carrier names (e.g., "FedEx Ground" from "FedEx Ground/Home")
        // This helps with filtering
        const baseCarrierMatch = carrierName.match(/^([^/]+)/);
        if (baseCarrierMatch && baseCarrierMatch[1]) {
          carriers.add(baseCarrierMatch[1].trim());
        } else {
          carriers.add(carrierName);
        }
      });
      
      // Use raw carriers for the dropdown to show exact values
      setAvailableCarriers(Array.from(rawCarriers).sort());
      console.log('Available carriers:', Array.from(rawCarriers));
    } catch (err) {
      console.error('Error fetching carriers:', err);
      toast.error(`Failed to load carriers: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };
  
  // Function to reset form state
  const resetForm = () => {
    setDateRange({
      startDate: null,
      endDate: null
    });
    setSelectedCarrier('all_carriers');
    setErrors({});
  };
  
  // Fetch carriers when modal opens and reset form
  useEffect(() => {
    if (isOpen) {
      fetchAllCarriers();
      resetForm();
    }
  }, [isOpen]);
  
  // Function to export data as CSV
  const handleExportCSV = async () => {
    // Validate date range
    if (!dateRange.startDate || !dateRange.endDate) {
      setErrors({
        dateRange: 'Please select both start and end dates'
      });
      toast.error('Date range is required for export');
      return;
    }
    
    setLoading(true);
    setErrors({});
    
    try {
      const db = getFirestore();
      const packagesCollection = collection(db, 'packages');
      
      // Build query constraints
      const queryConstraints: QueryConstraint[] = [];
      
      // Apply date range filter if selected
      if (dateRange.startDate) {
        // Use 'yyyyMMdd' format without hyphens to match the database structure
        const startDateStr = format(dateRange.startDate, 'yyyyMMdd');
        console.log('Using start date filter:', startDateStr);
        queryConstraints.push(where('dateYmd', '>=', startDateStr));
      }
      
      if (dateRange.endDate) {
        // Use 'yyyyMMdd' format without hyphens to match the database structure
        const endDateStr = format(dateRange.endDate, 'yyyyMMdd');
        console.log('Using end date filter:', endDateStr);
        queryConstraints.push(where('dateYmd', '<=', endDateStr));
      }
      
      // Apply carrier filter if selected
      // Instead of exact match, we'll filter on the client side
      // This gives us more flexibility with carrier name formats
      if (selectedCarrier && selectedCarrier !== 'all_carriers') {
        console.log('Will filter by carrier (client-side):', selectedCarrier);
      }
      
      // Apply sorting
      queryConstraints.push(orderBy('timestamp', 'desc'));
      
      // Execute query
      console.log('Date range:', dateRange);
      console.log('Selected carrier:', selectedCarrier);
      
      // Log all query constraints for debugging
      queryConstraints.forEach((constraint, index) => {
        console.log(`Constraint ${index}:`, constraint);
      });
      
      // For testing, let's try a simple query first to see if we get any data
      let q;
      if (queryConstraints.length > 0) {
        q = query(packagesCollection, ...queryConstraints);
        console.log('Using query with constraints');
      } else {
        // Fallback to a simple query to verify data access
        q = query(packagesCollection, orderBy('timestamp', 'desc'));
        console.log('Using simple query without filters');
      }
      
      const querySnapshot = await getDocs(q);
      console.log('Query returned items:', querySnapshot.size);
      
      // Log the first few documents to see what we're getting
      let count = 0;
      querySnapshot.forEach(doc => {
        if (count < 3) {
          console.log('Document data:', doc.id, doc.data());
          count++;
        }
      });
      
      // Process the results
      interface TrackingItem {
        // id: string;
        tracking: string;
        carrier: string;
        timestamp: string | number | Date;
        deviceId: string;
        latitude: string;
        longitude: string;
        username: string;
        // date: string;
        // time: string;
      }

      const items: TrackingItem[] = [];
      
      querySnapshot.forEach(doc => {
        const data = doc.data();
        console.log('Processing doc:', doc.id, 'dateYmd:', data.dateYmd);
        
        // Check date filtering
        if (dateRange.startDate || dateRange.endDate) {
          const docDate = data.dateYmd;
          if (dateRange.startDate) {
            const startDateStr = format(dateRange.startDate, 'yyyyMMdd');
            if (docDate < startDateStr) {
              console.log('Skipping doc due to start date filter:', docDate, '<', startDateStr);
              return;
            }
          }
          if (dateRange.endDate) {
            const endDateStr = format(dateRange.endDate, 'yyyyMMdd');
            if (docDate > endDateStr) {
              console.log('Skipping doc due to end date filter:', docDate, '>', endDateStr);
              return;
            }
          }
        }
        
        // Extract carrier name
        let carrierName: string;
        if (typeof data.carrier === 'string') {
          carrierName = data.carrier;
        } else if (data.carrier && typeof data.carrier === 'object') {
          carrierName = (data.carrier as { name?: string }).name || 'Unknown';
        } else {
          carrierName = 'Unknown';
        }
        
        // Re-enable client-side filtering for carrier
        if (selectedCarrier && selectedCarrier !== 'all_carriers' && !carrierName.includes(selectedCarrier)) {
          console.log('Skipping item due to carrier mismatch:', carrierName, 'Selected:', selectedCarrier);
          return;
        }
        
        // Log carrier matches for debugging
        if (selectedCarrier) {
          console.log('Including item with carrier:', carrierName, 'Selected:', selectedCarrier);
        }
        
        // // Format date and time
        // let formattedDate = '';
        // let formattedTime = '';
        
        // if (data.timestamp) {
        //   try {
        //     const date = new Date(data.timestamp);
        //     // formattedDate = format(date, 'MMM dd, yyyy');
        //     // formattedTime = format(date, 'hh:mm a');
        //   } catch (e) {
        //     console.error('Error parsing date:', e);
        //   }
        // }
        
        items.push({
          // id: doc.id,
          tracking: data.tracking || 'Unknown',
          carrier: carrierName,
          timestamp: data.timestamp || 'N/A',
          deviceId: getDeviceLabel(data.deviceId),
          latitude: data.latitude?.toString() || 'N/A',
          longitude: data.longitude?.toString() || 'N/A',
          username: data.username || 'N/A',
          // date: formattedDate,
          // time: formattedTime
        });
      });
      
      // Check if we found any items
      if (items.length === 0) {
        let errorMessage = 'No tracking records found';
        if (selectedCarrier && selectedCarrier !== 'all_carriers') {
          errorMessage += ` for carrier "${selectedCarrier}"`;
        }
        if (dateRange.startDate || dateRange.endDate) {
          errorMessage += ' in the selected date range';
        }
        toast.error(errorMessage);
        return;
      }
      
      // Generate CSV content with proper escaping and formatting
      // Use quotes around all values to ensure proper Excel handling
      let csvContent = 'Tracking Number,Carrier,Timestamp,Device ID,Latitude,Longitude,Username\n';

      items.forEach(item => {
        // Wrap tracking number in quotes and use ="value" format to force Excel to treat it as text
        const trackingNumber = `"${item.tracking}"`;
        const carrier = `"${item.carrier.replace(/"/g, '""')}"`;
        const timestamp = `"${item.timestamp}"`;
        const deviceId = `"${item.deviceId}"`;
        const latitude = `"${item.latitude}"`;
        const longitude = `"${item.longitude}"`;
        const username = `"${item.username}"`;

        csvContent += `${trackingNumber},${carrier},${timestamp},${deviceId},${latitude},${longitude},${username}\n`;
      });
      
      // Create a blob and download the CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `tracking_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Show success toast notification
      toast.success(`Successfully exported ${items.length} tracking records to CSV!`);
      
      // Close modal after successful export
      onClose();
    } catch (err) {
      console.error('Error exporting CSV:', err);
      // Show detailed error toast notification
      const errorMessage = `Failed to export CSV: ${err instanceof Error ? err.message : 'Unknown error'}`;
      
      // Add query details to console for debugging
      console.error('Error details - Date range:', dateRange);
      console.error('Error details - Selected carrier:', selectedCarrier);
      
      // Show error toast
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle dialog close
  const handleDialogClose = (open: boolean) => {
    if (!open) {
      resetForm();
      onClose();
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-md p-6">
        <DialogHeader className="mb-1">
          <DialogTitle className="text-2xl font-bold">Export Tracking Data (CSV)</DialogTitle>
          <DialogDescription className="text-base mt-2">
            Generate a CSV file with tracking data based on the selected filters. Date range is mandatory.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="text-sm text-muted-foreground">
            <span className="text-red-500">*</span> Required field
          </div>
          {/* Date Range */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-base font-medium">
                Date Range <span className="text-red-500">*</span>
              </label>
              <span className="text-xs text-muted-foreground">
                Required for export
              </span>
            </div>
            <DateRangePicker 
              dateRange={dateRange}
              onDateRangeChange={(newRange) => {
                setDateRange(newRange);
                // Clear error when user changes date
                if (errors.dateRange) {
                  setErrors({});
                }
              }}
              hasError={!!errors.dateRange}
            />
            {errors.dateRange && (
              <p className="text-base text-red-500 mt-2">Please select both start and end dates</p>
            )}
          </div>
          
          {/* Carrier Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="carrier" className="text-base font-medium">
                Carrier
              </label>
              <span className="text-xs text-muted-foreground">
                Filter by shipping carrier
              </span>
            </div>
            <Select
              value={selectedCarrier || undefined}
              onValueChange={handleCarrierChange}
            >
              <SelectTrigger className="w-full h-11 text-base focus:ring-2 focus:ring-gray-200">
                <SelectValue placeholder="All Carriers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_carriers">All Carriers</SelectItem>
                {availableCarriers.map(carrier => (
                  <SelectItem key={carrier} value={carrier}>{carrier}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <DialogFooter className="flex justify-end gap-2">
          <Button 
            variant="outline" 
            onClick={() => {
              resetForm();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleExportCSV} disabled={loading}>
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                </svg>
                Export CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportModal;