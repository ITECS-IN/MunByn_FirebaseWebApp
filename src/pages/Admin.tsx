import { useState } from "react";
import { db } from "@/config/firebase";
import { collection, deleteDoc, getDocs } from "firebase/firestore";
import toast from "react-hot-toast";
import { Button } from "../components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

const Admin = () => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteByDateRange = async () => {
    if (!startDate || !endDate) {
      toast("Please select both start and end dates");
      return;
    }

    if (endDate < startDate) {
      toast("End date cannot be before start date");
      return;
    }

    const diffDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)
    );
    if (diffDays > 90) {
      toast("Date range cannot exceed 90 days");
      return;
    }

    try {
      setIsDeleting(true);
      const startTimestamp = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate()
      ).toISOString();

      const endCopy = new Date(endDate);
      endCopy.setHours(23, 59, 59, 999);
      const endTimestamp = endCopy.toISOString();

      const packagesRef = collection(db, "packages");
      const packagesSnapshot = await getDocs(packagesRef);

      let deletedCount = 0;

      for (const doc of packagesSnapshot.docs) {
        const pkg = doc.data();
        if (pkg.timestamp >= startTimestamp && pkg.timestamp <= endTimestamp) {
          await deleteDoc(doc.ref);
          deletedCount++;
        }
      }

      toast.success(`Successfully deleted ${deletedCount} packages`);
      setShowDeleteModal(false);
      setStartDate(undefined);
      setEndDate(undefined);
    } catch (error) {
      toast.error(`Error deleting packages: ${error}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-semibold mb-4">Admin Tools</h1>
      <p className="text-gray-600 mb-6">
        Perform administrative operations such as bulk deletion of packages.
      </p>

      {/* Delete by range button */}
        <div className="flex flex-col space-y-4 mb-6 bg-white p-6 rounded-lg shadow-md">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
    </div>
  );
};

export default Admin;
