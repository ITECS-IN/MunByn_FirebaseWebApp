import React from 'react';

interface CarrierBreakdownProps {
  data: {
    [key: string]: number;
  };
}

const CarrierBreakdown: React.FC<CarrierBreakdownProps> = ({ data }) => {
  // Calculate total for percentage computation
  const total = Object.values(data).reduce((sum, count) => sum + count, 0);
  
  // Prepare data for display
  const carriers = Object.entries(data).map(([carrier, count]) => ({
    name: carrier,
    count,
    percentage: Math.round((count / total) * 100)
  }));
  
  // Sort by count (highest first)
  carriers.sort((a, b) => b.count - a.count);
  
  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      {carriers.map((carrier) => (
        <div key={carrier.name} className="flex items-center text-xs text-gray-600 mt-1">
          <span className="flex-shrink-0 w-16 truncate" title={carrier.name}>
            {formatCarrierName(carrier.name)}
          </span>
          <div className="flex-grow mx-2">
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className={`h-1.5 rounded-full ${getCarrierColor(carrier.name)}`} 
                style={{ width: `${carrier.percentage}%` }}
              ></div>
            </div>
          </div>
          <span className="flex-shrink-0 text-gray-500">{carrier.count}</span>
        </div>
      ))}
    </div>
  );
};

// Helper function to get a color for each carrier
// Helper function to format carrier names for display
const formatCarrierName = (carrier: string): string => {
  if (carrier.length <= 10) {
    return carrier;
  }
  
  if (carrier.includes('FedEx Express')) {
    return 'FedEx Exp';
  } else if (carrier.includes('FedEx Ground')) {
    return 'FedEx Gnd';
  } else if (carrier.includes('USPS')) {
    return 'USPS';
  } else if (carrier.includes('Amazon')) {
    return 'Amazon';
  } else {
    // Return first 8 characters + ...
    return `${carrier.substring(0, 8)}...`;
  }
};

const getCarrierColor = (carrier: string): string => {
  // Normalize carrier name for comparison
  const normalizedCarrier = carrier.toLowerCase();
  
  if (normalizedCarrier.includes('ups')) {
    return 'bg-amber-600';
  } else if (normalizedCarrier.includes('fedex') && normalizedCarrier.includes('express')) {
    return 'bg-blue-600';
  } else if (normalizedCarrier.includes('fedex') && normalizedCarrier.includes('ground')) {
    return 'bg-green-600';
  } else if (normalizedCarrier.includes('usps')) {
    return 'bg-blue-800';
  } else if (normalizedCarrier.includes('dhl')) {
    return 'bg-yellow-500';
  } else if (normalizedCarrier.includes('amazon')) {
    return 'bg-orange-500';
  } else {
    // Generate a consistent color based on the carrier name
    const hash = carrier.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const hue = hash % 360;
    return `bg-[hsl(${hue},60%,45%)]`;
  }
};

export default CarrierBreakdown;