import { useState } from 'react';
import { Button } from './ui/button';
import ExportModal from './ExportModal';


const DashboardHeader = () => {
  // State for date range picker
  
  // State for export modal visibility
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  
  
  // Function to open export modal
  const handleOpenExportModal = () => {
    setIsExportModalOpen(true);
  };
  
  // Function to close export modal
  const handleCloseExportModal = () => {
    setIsExportModalOpen(false);
  };
  

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mb-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center ">
        <h1 className="text-2xl font-bold flex items-center">
          📦 Delivery Tracking Overview
        </h1>
        
        <div className="flex items-center mt-4 md:mt-0">
          <Button 
            onClick={handleOpenExportModal} 
            variant="outline"
            className="flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
            </svg>
            Export CSV
          </Button>
        </div>
      </div>
      
      
      {/* Export Modal */}
      <ExportModal 
        isOpen={isExportModalOpen} 
        onClose={handleCloseExportModal} 
      />
    </div>
  );
};

export default DashboardHeader;