# Frontend Login Guide

## How to Login in the Frontend

### Step 1: Start the Frontend

```bash
cd Hrms-client
npm install
npm run dev
```

The frontend will run on: `http://localhost:3002` (or the port shown in terminal)

---

### Step 2: Access Login Page

Open your browser and go to:
```
http://localhost:3002/#/login
```

Or simply:
```
http://localhost:3002
```
(It will redirect to login if not authenticated)

---

### Step 3: Enter Credentials

#### For Existing Users (After Initial Setup)

**Admin User:**
- **Username:** `admin`
- **Password:** `pass` (or your changed password)

**HR User:**
- **Username:** `hr`
- **Password:** `pass` (or your changed password)

**Employee User:**
- **Username:** `emp`
- **Password:** `pass` (or your changed password)

#### For New Users (First Time)

**New User (First Login):**
- **Username:** `admin` (or username you created)
- **Password:** `tempPassword123` (temporary password)

**Note:** After first login, you'll be prompted to change your password.

---

### Step 4: Login Process

1. **Enter Username** in the username field
2. **Enter Password** in the password field
3. **Click "Sign In"** button

---

### Step 5: What Happens After Login

#### If Login Successful:
- You'll be redirected to the dashboard based on your role:
  - **Employee** → Employee Dashboard (`/`)
  - **HR** → HR Dashboard (`/hr-approvals`)
  - **Admin** → Admin Dashboard (`/admin-settings`)

#### If First Login:
- You'll see a **"Setup New Password"** screen
- Enter your new password (minimum 4 characters)
- Click **"Set Password & Continue"**
- You'll then be redirected to your dashboard

#### If Login Fails:
- Error message will appear: "Invalid credentials. Please check your username and password."
- Check your credentials and try again

---

## Login Flow Diagram

```
┌─────────────────────┐
│  Login Page         │
│  /#/login           │
└──────────┬──────────┘
           │
           │ Enter username & password
           │
           ▼
┌─────────────────────┐
│  API Call           │
│  POST /api/auth/    │
│  login              │
└──────────┬──────────┘
           │
           ├─── Success ────┐
           │                │
           │         ┌──────▼──────┐
           │         │ First Login?│
           │         └──┬──────┬───┘
           │            │      │
           │      Yes   │      │ No
           │            │      │
           │     ┌──────▼──┐   │
           │     │ Change  │   │
           │     │Password │   │
           │     └────┬────┘   │
           │          │        │
           │          └───┬────┘
           │              │
           └─── Fail ────┴───► Dashboard
                │
                ▼
         Error Message
```

---

## Complete Login Example

### Scenario 1: Regular Login (Existing User)

1. **Open:** `http://localhost:3002/#/login`
2. **Enter:**
   - Username: `admin`
   - Password: `pass`
3. **Click:** "Sign In"
4. **Result:** Redirected to Admin Dashboard

### Scenario 2: First Login (New User)

1. **Open:** `http://localhost:3002/#/login`
2. **Enter:**
   - Username: `admin`
   - Password: `tempPassword123`
3. **Click:** "Sign In"
4. **Result:** See "Setup New Password" screen
5. **Enter:** New password (e.g., `MySecurePass123`)
6. **Click:** "Set Password & Continue"
7. **Result:** Redirected to Dashboard

---

## Troubleshooting

### Issue: "Invalid credentials"

**Possible Causes:**
- Wrong username or password
- User doesn't exist in database
- Backend server not running

**Solutions:**
1. Verify username is correct (case-sensitive)
2. Check password is correct
3. Ensure backend server is running on `http://82.112.226.75:5001`
4. Check browser console for errors (F12)

### Issue: Can't Access Login Page

**Solutions:**
1. Check frontend server is running
2. Verify URL: `http://localhost:3002/#/login`
3. Clear browser cache
4. Check browser console for errors

### Issue: Stuck on Login Page

**Solutions:**
1. Check backend API is accessible: `http://82.112.226.75:5001/health`
2. Verify API URL in `.env` file:
   ```
   VITE_API_URL=http://82.112.226.75:5001/api
   ```
3. Check browser Network tab (F12) for API errors
4. Restart both frontend and backend servers

### Issue: Token Not Saved

**Solutions:**
1. Check browser localStorage is enabled
2. Clear localStorage and try again:
   ```javascript
   // In browser console (F12)
   localStorage.clear()
   ```
3. Check browser doesn't block localStorage

---

## API Configuration

### Check API URL

The frontend uses the API URL from environment variable:

**File:** `Hrms-client/.env` (create if doesn't exist)
```
VITE_API_URL=http://82.112.226.75:5001/api
```

**Default:** If not set, defaults to `http://82.112.226.75:5001/api`

---

## Login Credentials Reference

| User Type | Username | Default Password | First Login Password |
|-----------|----------|------------------|---------------------|
| Admin | `admin` | `pass` | `tempPassword123` |
| HR | `hr` | `pass` | `tempPassword123` |
| Employee | `emp` | `pass` | `tempPassword123` |

**Note:** After running `npm run init-db` in backend, default passwords are `pass`. New users created via API get `tempPassword123`.

---

## Quick Start Checklist

- [ ] Backend server running on `http://82.112.226.75:5001`
- [ ] Frontend server running on `http://localhost:3002`
- [ ] Database connected (check backend console)
- [ ] Users exist in database (run `npm run init-db` in backend)
- [ ] API URL configured in `.env` (optional)
- [ ] Browser allows localStorage

---

## Testing Login

### Test with Browser Console

Open browser console (F12) and check:

```javascript
// Check if token is saved
localStorage.getItem('token')

// Check current user (after login)
// Should show user object in AppContext
```

### Test API Directly

```bash
# Test login endpoint
curl -X POST http://82.112.226.75:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"pass"}'
```

---

## After Successful Login

Once logged in, you can:

1. **View Dashboard** - Based on your role
2. **Clock In/Out** - For employees
3. **Request Leave** - Submit leave requests
4. **Manage Users** - For Admin/HR
5. **View Reports** - For Admin/HR
6. **Logout** - Click logout button in sidebar

---

## Logout

To logout:
1. Click the **Logout** button in the sidebar
2. Or navigate to `/login` route
3. Token will be cleared from localStorage
4. You'll be redirected to login page

---

## Security Notes

- Tokens are stored in `localStorage`
- Tokens expire after 7 days
- Password is never stored in frontend
- All API calls include token automatically
- Token is cleared on logout

