If by "online message and call like Uber" you mean a ride-hailing platform where passengers can request rides, communicate with drivers via chat/calls, and track trips, here's a complete system description.

Online Ride-Hailing System (Uber-like)
Overview

A ride-hailing platform connects:

Passengers
Drivers
Administrators
Customer Support Agents
Fleet Operators (optional)

The platform allows passengers to request rides, drivers to accept rides, and both parties to communicate through messaging and calling features.

1. User Types
Passenger

A passenger can:

Register and log in
Manage profile
Save favorite locations
Request rides
View fare estimates
Track drivers in real time
Chat with drivers
Call drivers through masked numbers
Pay for rides
Rate drivers
View trip history
Driver

A driver can:

Register and submit documents
Go online/offline
Accept or reject ride requests
Navigate to pickup locations
Chat with passengers
Call passengers
Complete trips
View earnings
Manage vehicle information
Rate passengers
Administrator

The administrator manages:

Users
Drivers
Vehicles
Pricing
Promotions
Payments
Complaints
Reports
Fraud detection
Customer Support Agent

Support staff can:

View trip details
Handle complaints
Process refunds
Assist drivers
Assist passengers
Fleet Manager (Optional)

For taxi companies:

Manage multiple drivers
Track vehicle locations
Monitor performance
Generate reports
2. Core Functionalities
User Management
Passenger Registration
Email registration
Phone verification
Social login
Driver Registration
Identity verification
Driver's license upload
Vehicle registration
Background checks
Ride Booking

Passenger enters:

Pickup location
Destination
Ride type

System returns:

Estimated fare
Estimated arrival time
Available drivers
Ride Matching

The system:

Finds nearby drivers
Calculates distance
Sends requests
Assigns driver
Real-Time GPS Tracking

Features:

Live driver location
Live passenger location
Route optimization
Estimated arrival updates
In-App Messaging

Passenger ↔ Driver communication:

Chat Features
Text messages
Read receipts
Delivery status
Media sharing (optional)
Example
Passenger: I'm at the main entrance.
Driver: Arriving in 2 minutes.
In-App Calling

Privacy-preserving communication:

Voice Calls
Driver calls passenger
Passenger calls driver

Features:

Number masking
Call logging
Spam prevention
Trip Management

Trip states:

Requested
Assigned
Driver En Route
Arrived
Trip Started
Trip In Progress
Completed
Cancelled
Payments

Supported methods:

Credit cards
Debit cards
Mobile money
Digital wallets
Cash

Features:

Automatic fare calculation
Receipts
Refund processing
Ratings and Reviews

Passengers rate:

Driver behavior
Vehicle cleanliness
Safety

Drivers rate:

Passenger behavior
Punctuality
3. Functional Requirements
Authentication
Login
Logout
Password recovery
Multi-factor authentication
Passenger Requirements
Search destinations
Request rides
Track rides
Pay fares
Contact drivers
Driver Requirements
Accept rides
Navigate routes
Manage availability
Receive earnings
Admin Requirements
User suspension
Fare management
Driver approval
System monitoring
4. Non-Functional Requirements
Performance
Response time under 2 seconds
Ride matching under 5 seconds
Scalability

Support:

Millions of users
Thousands of simultaneous trips
Availability
99.9% uptime
Security
Encrypted communications
Secure payment processing
GDPR/POPIA compliance
Reliability
Backup systems
Disaster recovery
5. High-Level Architecture
┌─────────────────────┐
│ Mobile Apps         │
│ Passenger App       │
│ Driver App          │
│ Admin Dashboard     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ API Gateway         │
└──────────┬──────────┘
           │
 ┌─────────┼─────────┐
 │         │         │
 ▼         ▼         ▼

User     Ride      Messaging
Service  Service   Service

 │         │         │

 ▼         ▼         ▼

Payment  Location  Notification
Service  Service   Service

           │
           ▼

      Database Layer
6. Microservices Architecture
Authentication Service

Handles:

Login
Registration
Tokens
Security
User Service

Stores:

Profiles
Preferences
Settings
Driver Service

Stores:

Driver details
Vehicle information
Status
Ride Service

Manages:

Ride requests
Assignments
Trip lifecycle
Location Service

Handles:

GPS updates
Driver tracking
Route calculations
Messaging Service

Handles:

Real-time chat
Message history
Notifications
Calling Service

Handles:

Voice calls
WebRTC sessions
Call records
Payment Service

Handles:

Fare calculation
Transactions
Refunds
Notification Service

Handles:

SMS
Push notifications
Emails
7. Database Design
Users
Users
(
    user_id,
    role,
    name,
    phone,
    email,
    password_hash
)
Drivers
Drivers
(
    driver_id,
    user_id,
    vehicle_id,
    status,
    rating
)
Vehicles
Vehicles
(
    vehicle_id,
    make,
    model,
    plate_number
)
Trips
Trips
(
    trip_id,
    passenger_id,
    driver_id,
    pickup_location,
    destination,
    fare,
    status
)
Messages
Messages
(
    message_id,
    sender_id,
    receiver_id,
    trip_id,
    message_text,
    timestamp
)
Calls
Calls
(
    call_id,
    caller_id,
    receiver_id,
    trip_id,
    start_time,
    end_time
)
Payments
Payments
(
    payment_id,
    trip_id,
    amount,
    payment_method,
    status
)
8. Recommended Technology Stack
Mobile Apps
Flutter
React Native
Backend
Node.js
ASP.NET Core
Spring Boot
Real-Time Communication
WebSocket Protocol Overview
WebRTC
Databases
PostgreSQL
Redis
Cloud Infrastructure
Amazon Web Services (AWS)
Microsoft Azure
Typical Ride Flow
Passenger Opens App
        ↓
Request Ride
        ↓
Fare Estimate
        ↓
Nearby Drivers Located
        ↓
Driver Accepts
        ↓
Passenger & Driver Chat/Call
        ↓
Driver Arrives
        ↓
Trip Starts
        ↓
Live Tracking
        ↓
Trip Ends
        ↓
Payment Processed
        ↓
Ratings Submitted