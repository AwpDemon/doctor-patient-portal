# HealthBridge - Doctor-Patient Portal

A full-stack web application simulating real-world doctor-patient interactions with secure role-based authentication, dynamic data-driven interfaces, and a modern medical-themed UI.

**University of Georgia | CSCI 4050 - Software Engineering | Spring-Summer 2025**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-v18%2B-green.svg)
![Express](https://img.shields.io/badge/express-4.x-lightgrey.svg)

---

## Screenshots

| Login Page | Patient Dashboard |
|:---:|:---:|
| ![Login](docs/screenshots/login.png) | ![Patient Dashboard](docs/screenshots/patient-dashboard.png) |

| Doctor Dashboard | Appointment Scheduling |
|:---:|:---:|
| ![Doctor Dashboard](docs/screenshots/doctor-dashboard.png) | ![Appointments](docs/screenshots/appointments.png) |

| Secure Messaging | Prescription Management |
|:---:|:---:|
| ![Messages](docs/screenshots/messages.png) | ![Prescriptions](docs/screenshots/prescriptions.png) |

---

## Features

### Authentication & Security (5+ flows)
- **Login/Logout** with session-based authentication
- **User Registration** with role selection (patient, doctor)
- **Password Reset** via token-based flow
- **Two-Factor Authentication (2FA)** with TOTP (Google Authenticator compatible)
- **Password Change** for authenticated users
- **Session Management** with inactivity timeout and activity tracking
- **Rate Limiting** on login attempts to prevent brute force
- **Role-Based Access Control** (RBAC) - doctors, patients, and admins see different interfaces
- **Audit Logging** for security-critical actions
- **Password Strength Validation** with real-time visual feedback

### Dynamic UI Modules (10+)
1. **Dashboard** - Role-specific overview with stats, upcoming appointments, and quick actions
2. **Patient Records** - Comprehensive patient profiles with medical history tabs
3. **Appointment Scheduling** - Book, reschedule, cancel appointments with real-time slot availability
4. **Secure Messaging** - HIPAA-inspired messaging with threads, urgent flags, and read receipts
5. **Prescription Management** - Create, edit, and refill prescriptions with pharmacy details
6. **Billing & Payments** - Invoice tracking, payment processing, insurance breakdowns
7. **Lab Results** - Color-coded results viewer with status indicators and reference ranges
8. **Profile Management** - Edit personal info, emergency contacts, insurance details
9. **Notifications** - Real-time notification panel with polling, categorized by type
10. **Global Search** - Instant search across patients, doctors, appointments, medications
11. **Admin Panel** - User management, system stats, audit log viewer

### Technical Highlights
- **Single Page Application** architecture with client-side routing
- **RESTful API** design with 30+ endpoints
- **SQLite** database with WAL mode for concurrent access
- **bcrypt** password hashing (12 rounds)
- **Input validation** via express-validator
- **Responsive design** - fully functional on mobile, tablet, and desktop
- **Clean, modern UI** with CSS custom properties design system
- **Material Design Icons** via Google Material Symbols

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| **Backend** | Node.js, Express.js |
| **Database** | SQLite (via better-sqlite3) |
| **Authentication** | express-session, bcryptjs, speakeasy (TOTP) |
| **Security** | helmet, CORS, rate limiting, input validation |
| **Testing** | Jest, Supertest |

---

## Getting Started

### Prerequisites
- Node.js v18 or higher
- npm v9 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/AwpDemon/doctor-patient-portal.git
cd doctor-patient-portal

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Seed the database with demo data
npm run seed

# Start the development server
npm run dev
```

The application will be available at **http://localhost:3000**

### Demo Credentials

All demo accounts use the password: `Password123`

| Role | Email | Notes |
|------|-------|-------|
| Admin | admin@healthbridge.com | Full system access, user management |
| Doctor | dr.chen@healthbridge.com | Cardiology, has existing patients |
| Doctor | dr.patel@healthbridge.com | Family Medicine |
| Doctor | dr.johnson@healthbridge.com | Orthopedics |
| Doctor | dr.williams@healthbridge.com | Dermatology |
| Patient | john.doe@email.com | Has appointments, prescriptions, lab results |
| Patient | mary.smith@email.com | Has appointments and messages |
| Patient | david.wilson@email.com | Has MRI results, active prescriptions |

---

## Project Structure

```
doctor-patient-portal/
├── server.js                 # Express server entry point
├── config/
│   └── db.js                 # SQLite database initialization
├── middleware/
│   └── auth.js               # Authentication & authorization middleware
├── models/
│   ├── User.js               # User model (CRUD, auth, 2FA)
│   ├── Appointment.js        # Appointment model with scheduling logic
│   ├── Message.js            # Messaging model with threads
│   └── Prescription.js       # Prescription model with refills
├── routes/
│   ├── auth.js               # Auth routes (register, login, 2FA, reset)
│   ├── appointments.js       # Appointment CRUD + scheduling
│   ├── messages.js           # Messaging endpoints
│   ├── patients.js           # Patient records, lab results, billing
│   ├── prescriptions.js      # Prescription management
│   └── dashboard.js          # Dashboard data, notifications, search, admin
├── public/
│   ├── css/styles.css        # Complete design system (~1200 lines)
│   ├── js/
│   │   ├── app.js            # Core SPA logic, routing, utilities
│   │   ├── auth.js           # Client-side auth flows
│   │   ├── dashboard.js      # Role-specific dashboards
│   │   ├── appointments.js   # Appointment UI module
│   │   ├── messages.js       # Messaging UI module
│   │   ├── patients.js       # Patient records UI
│   │   ├── prescriptions.js  # Prescription UI module
│   │   ├── billing.js        # Billing UI module
│   │   ├── labresults.js     # Lab results viewer
│   │   ├── profile.js        # Profile management
│   │   ├── notifications.js  # Notification system
│   │   └── search.js         # Global search
│   └── index.html            # SPA entry point
├── data/
│   └── seed.js               # Database seed script
└── tests/
    └── auth.test.js           # Authentication test suite
```

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/logout` | End session |
| GET | `/api/auth/session` | Check session status |
| GET | `/api/auth/me` | Get current user profile |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset with token |
| POST | `/api/auth/change-password` | Change password (authenticated) |
| POST | `/api/auth/setup-2fa` | Generate 2FA QR code |
| POST | `/api/auth/enable-2fa` | Confirm and enable 2FA |
| POST | `/api/auth/verify-2fa` | Verify 2FA code on login |
| POST | `/api/auth/disable-2fa` | Disable 2FA |

### Appointments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/appointments` | List user's appointments |
| GET | `/api/appointments/upcoming` | Get upcoming appointments |
| GET | `/api/appointments/today` | Today's schedule (doctors) |
| GET | `/api/appointments/available-slots` | Available time slots |
| GET | `/api/appointments/stats` | Appointment statistics |
| GET | `/api/appointments/:id` | Get appointment details |
| POST | `/api/appointments` | Book new appointment |
| PUT | `/api/appointments/:id` | Update appointment |
| PUT | `/api/appointments/:id/cancel` | Cancel appointment |

### Messages, Prescriptions, Patients
*(See route files for complete endpoint documentation)*

---

## Testing

```bash
# Run test suite
npm test

# Run with coverage
npx jest --coverage
```

The test suite covers:
- User registration validation
- Login/logout flow
- Password reset token flow
- Password change
- Session management
- Role-based access control
- Rate limiting behavior

---

## Team

| Member | Role | Key Contributions |
|--------|------|-------------------|
| **Ali Askari** | Lead Developer | Architecture, backend API, database design, authentication system |
| **Sarah Mitchell** | Frontend Developer | UI/UX design, CSS design system, responsive layout, dashboard modules |
| **James Park** | Full Stack | Messaging system, notification module, search functionality |
| **Maria Santos** | Backend Developer | Patient records, prescription management, billing module, seed data |
| **David Kim** | QA & Testing | Test suite, security review, lab results module, documentation |

---

## Development Timeline

| Phase | Period | Deliverables |
|-------|--------|-------------|
| Phase 1 | Jan - Feb 2025 | Requirements, database schema, project scaffold |
| Phase 2 | Feb - Mar 2025 | Authentication system, user models, basic API |
| Phase 3 | Mar - Apr 2025 | Core modules (appointments, messaging, prescriptions) |
| Phase 4 | Apr - May 2025 | Frontend SPA, dashboard, UI polish |
| Phase 5 | May - Jun 2025 | Billing, lab results, search, admin panel |
| Phase 6 | Jun - Jul 2025 | Testing, security audit, documentation, deployment |

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- University of Georgia CSCI 4050 course staff for project guidance
- [Material Symbols](https://fonts.google.com/icons) for the icon library
- [Inter](https://rsms.me/inter/) font family by Rasmus Andersson
- SQLite documentation and community resources
