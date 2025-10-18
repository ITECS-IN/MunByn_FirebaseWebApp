import { Outlet, NavLink } from "react-router-dom"
import { useAuth } from "../contexts/useAuth"
import { Toaster } from 'react-hot-toast'

const MainLayout = () => {
    const { user } = useAuth()
    
    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            {/* Toast notifications */}
            <Toaster 
                position="top-right"
                toastOptions={{
                    success: {
                        style: {
                            background: '#10B981',
                            color: 'white',
                        },
                        duration: 3000,
                    },
                    error: {
                        style: {
                            background: '#EF4444',
                            color: 'white',
                        },
                        duration: 5000,
                    },
                }}
            />
            
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex">
                            <div className="flex-shrink-0 flex items-center">
                                <span className="text-xl font-bold">📦 Delivery Tracking</span>
                            </div>
                            <nav className="ml-6 flex space-x-8">
                                <NavLink 
                                    to="/" 
                                    className={({ isActive }) => 
                                        `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                                            isActive 
                                                ? 'border-indigo-500 text-gray-900' 
                                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                        }`
                                    }
                                    end
                                >
                                    Dashboard
                                </NavLink>
                            </nav>
                        </div>
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <span className="text-sm font-medium text-gray-500">
                                    {user?.name || user?.email || 'User'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            <main className="flex-grow">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}

export default MainLayout