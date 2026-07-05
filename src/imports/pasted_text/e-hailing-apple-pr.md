________________________________________
E-hailing Apple — Complete Product Requirements
What it is
E-hailing Apple is a public ride-hailing platform — like Uber, inDrive, or Bolt — built with healthcare and accessibility as first-class features. Anyone in the public can book a ride. The platform goes further than standard e-hailing by supporting wheelchair-accessible vehicles, medical trip notes, pre-scheduled recurring rides, a caregiver booking layer, and a dedicated SOS safety system.
________________________________________
1. User types
Riders — the general public. Anyone booking a ride for any purpose, including medical appointments, pharmacy runs, therapy sessions, or general travel.
Drivers — vetted vehicle owners who accept ride requests. Healthcare-specific drivers undergo additional checks (first aid awareness, accessible vehicle inspection).
Caregivers — family members or assistants who book and monitor rides on behalf of a rider who cannot manage the app themselves (elderly, post-surgery, disability).
Admins — E-hailing Apple operations team managing the platform, driver compliance, pricing, and disputes.
________________________________________
2. Functional requirements
Rider app
Registration via phone number and OTP — no passwords. Profile setup includes name, photo, saved home/clinic addresses, and emergency contacts. Booking flow: enter pickup and destination, choose ride category (standard, wheelchair-accessible, stretcher/NEMT), optionally add a trip note for the driver ("I use crutches — please wait 3 minutes at pickup"). Live driver tracking with ETA and a map showing the driver moving in real time. One-tap SOS panic button visible throughout the trip — shares location with emergency contacts and offers a direct call to emergency services. Pre-booking for future appointments with optional recurrence (daily, weekly, custom). Payment via card, mobile money, in-app wallet, or cash. Post-trip star rating and written review for the driver. Trip history with receipts.
Driver app
Registration with document upload: driver's license, vehicle registration, insurance certificate, vehicle photos, and (for accessible vehicle drivers) accessibility equipment photos. Availability toggle — online/offline. Incoming ride request shows rider name, trip type, special notes, distance, and estimated fare before the driver decides to accept or decline. Built-in turn-by-turn navigation. Pickup confirmation with a time-stamp. Drop-off confirmation with optional photo proof. Earnings dashboard showing daily, weekly, and monthly totals with payout history. Offline GPS mode — navigation continues even when connectivity drops mid-trip.
Caregiver app
Link to a rider account with that rider's consent (OTP verification). Book rides on the rider's behalf selecting the correct vehicle type and adding notes. Live trip tracking on the caregiver's own device in real time. Receive push notifications at driver arrival, trip start, and drop-off. Useful for elderly patients, children, or anyone who cannot manage the app independently.
Admin panel
Live operations map showing all active trips, driver locations, and status. Driver onboarding queue with document review and approve/reject workflow. Pricing configuration by zone — base fare, per-km rate, per-minute rate, and surge multiplier. Dispute management — rider and driver complaint resolution. Financial reports — revenue, payouts, platform commission. Driver compliance tracker — license and insurance expiry alerts. Platform KPIs — trips per day, acceptance rate, cancellation rate, average ETA, SOS events.
________________________________________
3. E-hailing Apple differentiators
Feature	Uber / Bolt / inDrive	E-hailing Apple
Vehicle types	Sedan, SUV, XL	+ Wheelchair van, stretcher/NEMT
Driver vetting	License + background check	+ First aid awareness + accessible vehicle inspection
Trip notes for driver	None	Medical/mobility notes visible before acceptance
Caregiver booking	Not supported	Full caregiver account with live tracking
Scheduled / recurring rides	Limited	Full pre-book + weekly/daily recurrence
SOS button	Basic (some apps)	Persistent in-trip panic button + emergency services dial
Boarding time buffer	Standard	Extended for wheelchair and stretcher rides
Offline GPS	Not standard	Driver app caches trip navigation locally
________________________________________
4. Non-functional requirements
Performance: API response time under 200ms at the 95th percentile. GPS location updates every 3–5 seconds. Platform must support 50,000 concurrent users at launch, horizontally scalable to 500,000+.
Availability: 99.9% uptime for core booking and payment flows. 99.99% uptime for the SOS service — it must never go down, even during deployments.
Security: All data in transit encrypted via TLS 1.3. Data at rest encrypted with AES-256. Driver KYC via ID upload and selfie biometric match. Role-based access control on all services. No plaintext passwords stored anywhere — OTP-only auth.
Offline resilience: Driver app must cache the current trip's GPS route and navigation instructions locally. A connectivity drop mid-trip must not interrupt navigation or close the trip session.
Accessibility (the app itself): Full VoiceOver (iOS) and TalkBack (Android) support. Minimum touch target 44×44pt. Minimum body font 16sp. High-contrast mode. Booking completed in no more than 3 taps from the home screen for standard rides.
Scalability: All backend services are independently deployable and horizontally scalable containers on Kubernetes. Matching engine and location service scale separately from billing and notifications.
________________________________________
5. Full tech stack
Layer	Technology
Rider, Driver & Caregiver apps	React Native (iOS + Android, shared codebase)
Admin web panel	Next.js + TypeScript
API gateway	Kong or AWS API Gateway
Auth service	Phone OTP + JWT + refresh tokens (no passwords)
Core backend services	Node.js microservices
Matching & location engine	Go (high-throughput, low-latency)
Real-time communication	WebSockets via Socket.io
Primary database	PostgreSQL (encrypted columns for trip notes)
GPS / location history	InfluxDB or TimescaleDB
Cache	Redis (driver locations, active sessions, ETA cache)
Message bus	Apache Kafka (trip events, notifications fan-out)
Object storage	AWS S3 (driver documents, trip photos, audit logs)
Maps & routing	Google Maps Platform or Mapbox
Payments	Stripe (global), Flutterwave, MTN MoMo
SMS & push notifications	Africa's Talking (Africa), Twilio (global), Firebase FCM
Analytics	BigQuery or Metabase
Container orchestration	Docker + Kubernetes (AWS EKS or GCP GKE)
CI/CD	GitHub Actions
Monitoring & errors	Datadog + Sentry

