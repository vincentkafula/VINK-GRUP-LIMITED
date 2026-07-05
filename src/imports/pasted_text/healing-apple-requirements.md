People going to clinics, pharmacies, hospitals, therapy sessions
Elderly or disabled passengers needing safe, assisted transport
Non-emergency medical trips for the general public

No hospital B2B portal needed. Let me redo this cleanly.
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 0.25s;
    animation-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
  }
VvisualizeVvisualize show_widget
Healing Apple — Full Public App Requirements
Concept
A ride-hailing app built specifically for the public's healthcare transport needs — anyone going to a clinic, pharmacy, therapy, or hospital. Like Uber, but drivers are health-transport vetted, vehicles are accessible, rides can be pre-scheduled for recurring medical appointments, and every trip has a safety layer tuned for vulnerable passengers.

1. User types
Patients / riders — the general public booking health-related trips. They may be elderly, disabled, post-surgery, or managing chronic conditions.
Caregivers — family members or personal assistants who book rides on behalf of a patient. They get trip visibility without being in the car.
Drivers — vetted transport providers who accept health-trip requests. They see relevant passenger context before accepting.
Admins — internal Healing Apple operations team managing drivers, pricing, disputes, and platform health.

2. Functional requirements
Rider / patient app
Passengers register with phone OTP and a basic profile. Booking flow lets them choose trip type: standard ride, wheelchair-accessible vehicle, or stretcher/NEMT. They can add a medical note to every trip ("I use a walker" or "please allow extra boarding time") that the driver sees before accepting. Live GPS tracking of driver en route and during trip. ETA countdown. One-tap SOS that shares real-time location with emergency contacts and optionally dials local emergency services. Pre-booking for future appointments with recurring trip support (e.g. every Tuesday at 9am for physiotherapy). Multiple payment methods: card, mobile money, in-app wallet, and cash. Post-trip rating and driver review.
Caregiver / family app
Caregivers link to a patient account with patient consent. They can book rides on the patient's behalf, monitor the live trip on their own device, and receive arrival/departure notifications. Particularly important for elderly patients who struggle with smartphones.
Driver app
Drivers see incoming requests with full trip context before deciding to accept — including accessibility needs and medical notes. Turn-by-turn navigation built in. Proof of drop-off via photo or signature. Earnings dashboard, payout history, and document upload portal for compliance renewal. Offline GPS caching so navigation works in low-signal zones.
Admin panel
Live map of all active trips. Driver onboarding queue with document review. Surge pricing controls by zone. Trip dispute management. Financial reporting and driver payout management. Platform KPIs (trips per day, acceptance rate, cancellation rate, average ETA).

3. Health-specific features (the differentiators)
Accessibility vehicle types: Standard sedan, wheelchair-accessible van, stretcher/flat-bed vehicle. Passengers select at booking; only matching vehicles appear.
Medical notes on every trip: A free-text field visible to drivers before they accept. Covers mobility aids, oxygen equipment, post-op conditions, hearing/vision impairment.
Recurring / scheduled rides: Passengers book standing appointments — dialysis 3x per week, weekly physio, monthly oncology. Automatic booking reminder and driver pre-assignment when available.
SOS safety layer: A persistent panic button on the live trip screen. One tap shares GPS coordinates with up to 3 emergency contacts and offers a one-press call to 112/911. For drivers, a separate SOS triggers an alert to Healing Apple ops plus emergency services.
Driver health-transport vetting: Beyond standard license and background check — drivers complete a basic first aid awareness module and vehicle inspection includes accessibility equipment checks.
Safe passenger onboarding time: Matching engine accounts for boarding time by vehicle type — stretcher rides get longer pickup windows so drivers aren't penalised for wait time.

4. Non-functional requirements
Performance: API responses under 200ms at 95th percentile. GPS updates every 3–5 seconds. Support 50,000 concurrent users at launch, horizontally scalable to 500,000+.
Availability: 99.9% uptime on core booking. 99.99% on SOS service — it cannot go down.
Security: TLS 1.3 in transit. AES-256 at rest. OTP-based auth. No passwords stored. Driver KYC with ID and selfie biometric match. Role-based access control.
Offline resilience: Driver app caches current trip GPS and navigation data locally so a connectivity drop mid-trip doesn't break navigation or end the trip.
Accessibility (app itself): Full VoiceOver/TalkBack support. Minimum font size 16sp. High-contrast mode. Simple booking flow in 3 taps from home screen.

5. Tech stack
LayerTechnologyMobile appsReact Native (iOS + Android, shared codebase)Admin web panelNext.js + TypeScriptAPI gatewayKong or AWS API GatewayAuth serviceOTP via SMS + JWT + refresh tokensBackend servicesNode.js microservices (Go for location/matching)Real-time layerWebSockets via Socket.ioPrimary databasePostgreSQL (encrypted columns for health notes)GPS/location historyInfluxDB or TimescaleDBCacheRedis (driver locations, session data, ETA cache)Message busApache Kafka (trip events, notifications)Object storageAWS S3 (driver docs, photos, logs)Maps & routingGoogle Maps Platform or MapboxPaymentsStripe, Flutterwave, MTN MoMoSMS / pushAfrica's Talking (Africa), Twilio (global), Firebase FCMAnalyticsBigQuery or Metabase on PostgreSQLDevOpsDocker + Kubernetes (AWS EKS or GCP GKE)MonitoringDatadog + Sentry

6. Key screens
Patient app: Splash/onboarding → Phone OTP → Home (map) → Ride type selector → Medical note input → Booking confirmation → Driver en-route tracking → Live trip + SOS button → Payment → Rating → Trip history.
Driver app: Registration + doc upload → Availability toggle → Incoming request (with passenger notes) → Accept/Decline → Navigation → Pickup confirmation → Drop-off + proof → Earnings.
Caregiver app: Link to patient → Book for patient → Live tracking → Notifications.
Admin panel: Live ops map → Driver list → Onboarding queue → Pricing config → Dispute inbox → Reports.

7. Ride flow (end to end)

Passenger opens app, sets pickup and destination, selects vehicle type.
Matching engine finds nearest available, qualified driver within acceptable radius.
Driver receives request with passenger name, vehicle type needed, and medical note.
Driver accepts → passenger sees driver name, photo, plate, ETA.
Both sides track each other live on the map.
Driver arrives → passenger notified → boarding time extended automatically for accessibility rides.
Trip starts → live GPS tracked → caregiver (if linked) sees real-time progress.
Drop-off → driver captures confirmation → trip closes → payment processed automatically.
Both parties rate each other → fed back into matching engine score.


8. Development phases
Phase 1 — MVP (months 1–4): Patient app, driver app, standard booking, single city, card payment, Google Maps, PostgreSQL backend, basic admin panel.
Phase 2 — Healthcare layer (months 5–8): Wheelchair/NEMT vehicle types, medical notes, caregiver accounts, SOS module, recurring/scheduled rides, mobile money.
Phase 3 — Scale & compliance (months 9–12): Multi-city rollout, driver compliance engine, surge pricing, analytics dashboard, offline GPS caching, full accessibility audit of apps.
Phase 4 — Growth (months 13+): Prescription delivery, loyalty/rewards for frequent medical travellers, AI-powered dispatch optimization, government NEMT partnership program.

9. Minimum team
2 mobile engineers (React Native), 3 backend engineers, 1 DevOps engineer, 1 product designer, 1 product manager, 1 QA engineer, and optionally 1 growth/partnerships lead for driver recruitment.

Want me to drill into any specific part — for example the matching engine algorithm, the SOS flow diagram, the database schema, or the driver onboarding compliance system?Want to be notified when Claude responds?NotifyClaude Fable 5 is currently unavailable.Learn more(opens in new tab)