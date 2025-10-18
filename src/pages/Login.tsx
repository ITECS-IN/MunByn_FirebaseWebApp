import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth, getFirebaseErrorMessage } from '../contexts/useAuth'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '../components/ui/button'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const { login, register, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  
  const from = location.state?.from?.pathname || '/'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!email || !password) {
      setError('Please provide both email and password')
      return
    }
    
    try {
      if (isRegister) {
        await register(email, password)
      } else {
        await login(email, password)
      }
      // Navigate to the page they were trying to access or home
      navigate(from, { replace: true })
    } catch (error) {
      setError(getFirebaseErrorMessage(error as { code?: string; message?: string }))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Delivery Tracking</h1>
          <h2 className="mt-2 text-gray-600">{isRegister ? 'Create an account' : 'Sign in to your account'}</h2>
        </div>
        
        {error && (
          <div className="p-3 bg-red-100 text-red-800 rounded">
            {error}
          </div>
        )}
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          
          <div>
            <Button 
              type="submit" 
              disabled={loading}
              className="w-full"
            >
              {loading ? (isRegister ? 'Creating account...' : 'Signing in...') : (isRegister ? 'Create Account' : 'Sign in')}
            </Button>
          </div>
          
          {/* <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
            >
              {isRegister ? 'Already have an account? Sign in' : 'Need an account? Register'}
            </button>
          </div> */}
        </form>
      </div>
    </div>
  )
}

export default Login