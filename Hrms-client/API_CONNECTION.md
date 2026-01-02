# Frontend-Backend API Connection Guide

## Overview
The frontend has been fully connected to the backend API. All mock data has been replaced with real API calls.

## What Was Changed

### 1. Created API Service (`services/api.ts`)
- Centralized API client with all endpoints
- Automatic token management (stored in localStorage)
- Error handling
- Type-safe API calls

### 2. Updated AppContext (`context/AppContext.tsx`)
- Replaced all mock data with API calls
- Automatic data refresh on authentication
- Periodic refresh every 30 seconds
- Proper error handling

### 3. Updated Login Component
- Async login handling
- Proper error messages
- Password change flow

## API Endpoints Used

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/change-password` - Change password
- `GET /api/auth/me` - Get current user

### Attendance
- `POST /api/attendance/clock-in` - Clock in
- `POST /api/attendance/clock-out` - Clock out
- `POST /api/attendance/break/start` - Start break
- `POST /api/attendance/break/end` - End break
- `GET /api/attendance/today` - Get today's attendance
- `GET /api/attendance/history` - Get attendance history
- `GET /api/attendance/today/all` - Get all today's attendance (HR/Admin)
- `PUT /api/attendance/:recordId` - Update attendance (HR/Admin)

### Leave Management
- `POST /api/leaves/request` - Request leave
- `GET /api/leaves/my-leaves` - Get my leaves
- `GET /api/leaves/all` - Get all leaves
- `GET /api/leaves/pending` - Get pending leaves
- `PUT /api/leaves/:id/status` - Update leave status

### Users
- `GET /api/users` - Get all users
- `GET /api/users/role/:role` - Get users by role
- `POST /api/users` - Create user
- `GET /api/users/stats/employees` - Get employee stats

### Holidays
- `GET /api/holidays` - Get all holidays
- `POST /api/holidays` - Add holiday
- `DELETE /api/holidays/:id` - Delete holiday

### Notifications
- `GET /api/notifications` - Get my notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read

### Settings
- `GET /api/settings` - Get settings
- `PUT /api/settings` - Update settings

### Reports
- `GET /api/reports/attendance` - Export attendance report

### Audit Logs
- `GET /api/audit` - Get audit logs (Admin only)

## Configuration

### Environment Variables
Create a `.env` file in `Hrms-client` directory:
```
VITE_API_URL=http://localhost:5001/api
```

If not set, it defaults to `http://localhost:5001/api`.

## How It Works

1. **Authentication**: Token is stored in localStorage after login
2. **Auto-refresh**: Data refreshes automatically every 30 seconds when authenticated
3. **Token Validation**: On app load, checks for existing token and validates it
4. **Error Handling**: All API errors are caught and displayed to users

## Testing

1. Start the backend server:
```bash
cd Hrms-server
npm install
npm start
```

2. Start the frontend:
```bash
cd Hrms-client
npm install
npm run dev
```

3. Login with default credentials (after running `npm run init-db` in backend):
- Admin: `admin` / `pass`
- HR: `hr` / `pass`
- Employee: `emp` / `pass`

## Notes

- All API calls include the JWT token automatically
- Data is transformed from backend format to frontend types
- Loading states are managed in the context
- The app handles token expiration gracefully

