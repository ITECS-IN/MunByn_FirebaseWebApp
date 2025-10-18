"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface DateRangePickerProps {
  dateRange: { startDate: Date | null; endDate: Date | null }
  onDateRangeChange: (range: { startDate: Date | null; endDate: Date | null }) => void
  className?: string
  hasError?: boolean
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  className,
  hasError = false,
}: DateRangePickerProps) {
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = React.useState(false)
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = React.useState(false)

  // Calculate minimum dates for validation
  const minEndDate = dateRange.startDate ? dateRange.startDate : undefined
  const maxStartDate = dateRange.endDate ? dateRange.endDate : undefined

  return (
    <div className="flex items-center space-x-2 flex-wrap gap-2">
      {/* Start Date Picker */}
      <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full flex-1 justify-start text-left font-normal",
              !dateRange.startDate && "text-muted-foreground",
              hasError && "border-red-500",
              className
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange.startDate ? (
              format(dateRange.startDate, "dd/MM/yyyy")
            ) : (
              <span>dd/mm/yyyy</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateRange.startDate || undefined}
            onSelect={(date) => {
              onDateRangeChange({ 
                startDate: date || null, 
                endDate: dateRange.endDate
              })
              setIsStartDatePickerOpen(false)
            }}
            toDate={maxStartDate}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <span className="text-muted-foreground">to</span>
      
      {/* End Date Picker */}
      <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full flex-1 justify-start text-left font-normal",
              !dateRange.endDate && "text-muted-foreground",
              hasError && "border-red-500",
              className
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange.endDate ? (
              format(dateRange.endDate, "dd/MM/yyyy")
            ) : (
              <span>dd/mm/yyyy</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateRange.endDate || undefined}
            onSelect={(date) => {
              onDateRangeChange({ 
                startDate: dateRange.startDate, 
                endDate: date || null
              })
              setIsEndDatePickerOpen(false)
            }}
            fromDate={minEndDate}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}