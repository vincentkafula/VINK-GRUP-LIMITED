import { useState, lazy, Suspense, startTransition, useEffect, useCallback } from "react";
import { Toaster } from "sonner";
import { checkHealth } from "./services/apiClient";
import { Header } from "./components/Header";
import { SearchSection } from "./components/SearchSection";
import { HeroSection } from "./components/HeroSection";
import { LazySection } from "./components/LazySection";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";

// ─── Below-fold homepage sections — code-split ────────────────────────────────
const FeaturesSection              = lazy(() => import("./components/FeaturesSection").then(m => ({ default: m.FeaturesSection })));
const ProtectionSection            = lazy(() => import("./components/ProtectionSection").then(m => ({ default: m.ProtectionSection })));
const WorldMapSection              = lazy(() => import("./components/WorldMapSection").then(m => ({ default: m.WorldMapSection })));
const CreditCardsSection           = lazy(() => import("./components/CreditCardsSection").then(m => ({ default: m.CreditCardsSection })));
const BusinessPowerSection         = lazy(() => import("./components/BusinessPowerSection").then(m => ({ default: m.BusinessPowerSection })));
const PreApprovalSection           = lazy(() => import("./components/PreApprovalSection").then(m => ({ default: m.PreApprovalSection })));
const FeaturedOffersSection        = lazy(() => import("./components/FeaturedOffersSection").then(m => ({ default: m.FeaturedOffersSection })));
const SpecialNeedSection           = lazy(() => import("./components/SpecialNeedSection").then(m => ({ default: m.SpecialNeedSection })));
const FinancialInstitutionsSection = lazy(() => import("./components/FinancialInstitutionsSection").then(m => ({ default: m.FinancialInstitutionsSection })));
const AppShowcaseSection           = lazy(() => import("./components/AppShowcaseSection").then(m => ({ default: m.AppShowcaseSection })));
const Footer                       = lazy(() => import("./components/Footer").then(m => ({ default: m.Footer })));

// ─── Overlays ─────────────────────────────────────────────────────────────────
const PostLoginHome               = lazy(() => import("./components/PostLoginHome").then(m => ({ default: m.PostLoginHome })));
const MobileNetworkDashboard      = lazy(() => import("./components/MobileNetworkDashboard").then(m => ({ default: m.MobileNetworkDashboard })));
const DriverDashboard             = lazy(() => import("./components/DriverDashboard").then(m => ({ default: m.DriverDashboard })));
const PassengerDashboard          = lazy(() => import("./components/PassengerDashboard").then(m => ({ default: m.PassengerDashboard })));
const OwnersDashboard             = lazy(() => import("./components/dashboards/OwnersDashboard").then(m => ({ default: m.OwnersDashboard })));
const InvestorsDashboard          = lazy(() => import("./components/dashboards/InvestorsDashboard").then(m => ({ default: m.InvestorsDashboard })));
const MarshallDashboard           = lazy(() => import("./components/dashboards/MarshallDashboard").then(m => ({ default: m.MarshallDashboard })));
const MerchantDashboard           = lazy(() => import("./components/dashboards/MerchantDashboard").then(m => ({ default: m.MerchantDashboard })));
const AuthorityDashboard          = lazy(() => import("./components/dashboards/AuthorityDashboard").then(m => ({ default: m.AuthorityDashboard })));
const SuperAdminDashboard         = lazy(() => import("./components/dashboards/SuperAdminDashboard").then(m => ({ default: m.SuperAdminDashboard })));
const RideHailingSystem           = lazy(() => import("./components/RideHailingSystem").then(m => ({ default: m.RideHailingSystem })));
const BankingDashboard            = lazy(() => import("./components/BankingDashboard").then(m => ({ default: m.BankingDashboard })));
const VehicleTrackingDashboard    = lazy(() => import("./components/VehicleTrackingDashboard").then(m => ({ default: m.VehicleTrackingDashboard })));
const VinkMarketplace             = lazy(() => import("./components/VinkMarketplace").then(m => ({ default: m.VinkMarketplace })));
const PersonalAccountViewer       = lazy(() => import("./components/PersonalAccountViewer").then(m => ({ default: m.PersonalAccountViewer })));
const PersonalProductLedgerViewer = lazy(() => import("./components/PersonalProductLedgerViewer").then(m => ({ default: m.PersonalProductLedgerViewer })));
const CreditCardViewer            = lazy(() => import("./components/CreditCardViewer").then(m => ({ default: m.CreditCardViewer })));
const CreditCardApplicationViewer = lazy(() => import("./components/CreditCardApplicationViewer").then(m => ({ default: m.CreditCardApplicationViewer })));
const LoanViewer                  = lazy(() => import("./components/LoanViewer").then(m => ({ default: m.LoanViewer })));
const InvestViewer                = lazy(() => import("./components/InvestViewer").then(m => ({ default: m.InvestViewer })));
const InsureViewer                = lazy(() => import("./components/InsureViewer").then(m => ({ default: m.InsureViewer })));
const RewardsViewer               = lazy(() => import("./components/RewardsViewer").then(m => ({ default: m.RewardsViewer })));
const ServiceApplicationViewer    = lazy(() => import("./components/ServiceApplicationViewer").then(m => ({ default: m.ServiceApplicationViewer })));
const ProductSelectorViewer       = lazy(() => import("./components/ProductSelectorViewer").then(m => ({ default: m.ProductSelectorViewer })));
const ClubBookingViewer           = lazy(() => import("./components/ClubBookingViewer").then(m => ({ default: m.ClubBookingViewer })));
const StartMyBusinessViewer       = lazy(() => import("./components/StartMyBusinessViewer").then(m => ({ default: m.StartMyBusinessViewer })));
const BusinessProductLedgerViewer = lazy(() => import("./components/BusinessProductLedgerViewer").then(m => ({ default: m.BusinessProductLedgerViewer })));
const BusinessAccountApplicationViewer = lazy(() => import("./components/BusinessAccountApplicationViewer").then(m => ({ default: m.BusinessAccountApplicationViewer })));
const BusinessAccountSelectorViewer = lazy(() => import("./components/BusinessAccountSelectorViewer").then(m => ({ default: m.BusinessAccountSelectorViewer })));
const BusinessLoanApplicationViewer = lazy(() => import("./components/BusinessLoanApplicationViewer").then(m => ({ default: m.BusinessLoanApplicationViewer })));
const ManageMyBusinessViewer      = lazy(() => import("./components/ManageMyBusinessViewer").then(m => ({ default: m.ManageMyBusinessViewer })));
const BusinessInternationalViewer = lazy(() => import("./components/BusinessInternationalViewer").then(m => ({ default: m.BusinessInternationalViewer })));
const BusinessStudioViewer        = lazy(() => import("./components/BusinessStudioViewer").then(m => ({ default: m.BusinessStudioViewer })));
const BusinessNewsViewer          = lazy(() => import("./components/BusinessNewsViewer").then(m => ({ default: m.BusinessNewsViewer })));
const CorporateAccountViewer      = lazy(() => import("./components/CorporateAccountViewer").then(m => ({ default: m.CorporateAccountViewer })));
const CorporateSolutionsViewer    = lazy(() => import("./components/CorporateSolutionsViewer").then(m => ({ default: m.CorporateSolutionsViewer })));
const CorporateLoanViewer         = lazy(() => import("./components/CorporateLoanViewer").then(m => ({ default: m.CorporateLoanViewer })));
const CorporateLoanApplicationViewer = lazy(() => import("./components/CorporateLoanApplicationViewer").then(m => ({ default: m.CorporateLoanApplicationViewer })));
const CorporateApiViewer          = lazy(() => import("./components/CorporateApiViewer").then(m => ({ default: m.CorporateApiViewer })));
const CorporateEventsViewer       = lazy(() => import("./components/CorporateEventsViewer").then(m => ({ default: m.CorporateEventsViewer })));
const CorporateSocialResponsibilityViewer = lazy(() => import("./components/CorporateSocialResponsibilityViewer").then(m => ({ default: m.CorporateSocialResponsibilityViewer })));
const InvestorRelationsViewer     = lazy(() => import("./components/InvestorRelationsViewer").then(m => ({ default: m.InvestorRelationsViewer })));
const GlobalBankingDashboard      = lazy(() => import("./components/GlobalBankingDashboard").then(m => ({ default: m.GlobalBankingDashboard })));
const FinancialReportsViewer      = lazy(() => import("./components/FinancialReportsViewer").then(m => ({ default: m.FinancialReportsViewer })));
const FoodDeliveryApp             = lazy(() => import("./components/FoodDeliveryApp").then(m => ({ default: m.FoodDeliveryApp })));
const AdminDashboard              = lazy(() => import("./components/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const GlobalSIMDashboard          = lazy(() => import("./components/GlobalSIMDashboard").then(m => ({ default: m.GlobalSIMDashboard })));
const CardNetworkDashboard        = lazy(() => import("./components/CardNetworkDashboard").then(m => ({ default: m.CardNetworkDashboard })));
const AFCManagementDashboard      = lazy(() => import("./components/AFCManagementDashboard").then(m => ({ default: m.AFCManagementDashboard })));
const AdminApplicationsViewer     = lazy(() => import("./components/AdminApplicationsViewer").then(m => ({ default: m.AdminApplicationsViewer })));
const RevenueDashboard            = lazy(() => import("./components/RevenueDashboard").then(m => ({ default: m.RevenueDashboard })));
const AFCApp                      = lazy(() => import("./components/apps/AFCApp").then(m => ({ default: m.AFCApp })));
const VehicleTrackingApp          = lazy(() => import("./components/apps/VehicleTrackingApp").then(m => ({ default: m.VehicleTrackingApp })));
const VinkBankingApp              = lazy(() => import("./components/apps/VinkBankingApp").then(m => ({ default: m.VinkBankingApp })));
const VinkDriverApp               = lazy(() => import("./components/apps/VinkDriverApp").then(m => ({ default: m.VinkDriverApp })));
const VinkPassengerApp            = lazy(() => import("./components/apps/VinkPassengerApp").then(m => ({ default: m.VinkPassengerApp })));
const VinkMobileApp               = lazy(() => import("./components/apps/VinkMobileApp").then(m => ({ default: m.VinkMobileApp })));
const AppLauncher                 = lazy(() => import("./components/apps/AppLauncher").then(m => ({ default: m.AppLauncher })));
const AboutVINKViewer              = lazy(() => import("./components/footerPages/AboutVINKViewer").then(m => ({ default: m.AboutVINKViewer })));
const CareersViewer               = lazy(() => import("./components/footerPages/CareersViewer").then(m => ({ default: m.CareersViewer })));
const NewsViewer                  = lazy(() => import("./components/footerPages/NewsViewer").then(m => ({ default: m.NewsViewer })));
const ContactUsViewer             = lazy(() => import("./components/footerPages/ContactUsViewer").then(m => ({ default: m.ContactUsViewer })));
const SwitchToVINKViewer           = lazy(() => import("./components/footerPages/SwitchToVINKViewer").then(m => ({ default: m.SwitchToVINKViewer })));
const FiveHundredGlobalApplication = lazy(() => import("./components/FiveHundredGlobalApplication").then(m => ({ default: m.FiveHundredGlobalApplication })));
const TaxiAssociationsViewer       = lazy(() => import("./components/TaxiAssociationsViewer").then(m => ({ default: m.TaxiAssociationsViewer })));
const ManagementHub                = lazy(() => import("./components/ManagementHub").then(m => ({ default: m.ManagementHub })));

export default function App() {
  // ── Mounted set — overlays mount on first open, stay mounted ──────────────
  const [mounted, setMounted] = useState<Set<string>>(new Set());
  const mount = useCallback((key: string) => {
    setMounted(prev => { const n = new Set(prev); n.add(key); return n; });
  }, []);
  const has = (key: string) => mounted.has(key);

  // ── Overlay visibility states ──────────────────────────────────────────────
  const [showPostLogin, setShowPostLogin]                   = useState(false);
  const [showMobileNetwork, setShowMobileNetwork]           = useState(false);
  const [showDriver, setShowDriver]                         = useState(false);
  const [showRider, setShowRider]                           = useState(false);
  const [showOwners, setShowOwners]                         = useState(false);
  const [showInvestors, setShowInvestors]                   = useState(false);
  const [showMarshall, setShowMarshall]                     = useState(false);
  const [showMerchant, setShowMerchant]                     = useState(false);
  const [showAuthority, setShowAuthority]                   = useState(false);
  const [showSuperAdmin, setShowSuperAdmin]                 = useState(false);
  const [showRideHailing, setShowRideHailing]               = useState(false);
  const [showBanking, setShowBanking]                       = useState(false);
  const [showVehicle, setShowVehicle]                       = useState(false);
  const [showSIMApp, setShowSIMApp]                         = useState(false);
  const [showMarketplace, setShowMarketplace]               = useState(false);

  // ── Super App Ecosystem ────────────────────────────────────────────────────
  const [showAFCApp, setShowAFCApp]                         = useState(false);
  const [showVehicleTrackingApp, setShowVehicleTrackingApp] = useState(false);
  const [showVinkBankingApp, setShowVinkBankingApp]         = useState(false);
  const [showVinkDriverApp, setShowVinkDriverApp]           = useState(false);
  const [showVinkPassengerApp, setShowVinkPassengerApp]     = useState(false);
  const [showVinkMobileApp, setShowVinkMobileApp]           = useState(false);
  const [showAppLauncher, setShowAppLauncher]               = useState(false);
  const [showRevenueDashboard, setShowRevenueDashboard]     = useState(false);

  // ── Personal products ──────────────────────────────────────────────────────
  const [showPersonalAccount, setShowPersonalAccount]       = useState(false);
  const [showPersonalLedger, setShowPersonalLedger]          = useState(false);
  const [ledgerCategory, setLedgerCategory]                  = useState<"creditCard" | "loan" | "invest" | "insure" | "rewards">("creditCard");
  const [showCreditCard, setShowCreditCard]                 = useState(false);
  const [showCreditCardApp, setShowCreditCardApp]           = useState(false);
  const [showLoan, setShowLoan]                             = useState(false);
  const [showInvest, setShowInvest]                         = useState(false);
  const [showInsure, setShowInsure]                         = useState(false);
  const [showRewards, setShowRewards]                       = useState(false);
  const [showInvestApp, setShowInvestApp]                   = useState(false);
  const [showInsureApp, setShowInsureApp]                   = useState(false);
  const [showRewardsApp, setShowRewardsApp]                 = useState(false);
  const [showSIMServiceApp, setShowSIMServiceApp]           = useState(false);
  const [showAccountApp, setShowAccountApp]                 = useState(false);
  const [showClubBooking, setShowClubBooking]               = useState(false);

  // ── Product selector ───────────────────────────────────────────────────────
  const [selectorOpen, setSelectorOpen]                     = useState(false);
  const [selectorCategory, setSelectorCategory]             = useState<"account"|"creditCard"|"loan"|"invest"|"insure"|"rewards"|"sim"|null>(null);

  // ── Business ──────────────────────────────────────────────────────────────
  const [showStartBusiness, setShowStartBusiness]           = useState(false);
  const [showBusinessAccounts, setShowBusinessAccounts]     = useState(false);
  const [showBusinessAccountSelector, setShowBusinessAccountSelector] = useState(false);
  const [chosenBusinessAccountType, setChosenBusinessAccountType] = useState<string | undefined>(undefined);
  const [showBusinessLedger, setShowBusinessLedger]         = useState(false);
  const [businessLedgerCategory, setBusinessLedgerCategory] = useState<"creditCard" | "loan" | "insure" | "invest">("creditCard");
  const [showBusinessLoanApp, setShowBusinessLoanApp]       = useState(false);
  const [showManageBusiness, setShowManageBusiness]         = useState(false);
  const [showBusinessInternational, setShowBusinessInternational] = useState(false);
  const [showBusinessStudio, setShowBusinessStudio]         = useState(false);
  const [showBusinessNews, setShowBusinessNews]             = useState(false);

  // ── Corporate ─────────────────────────────────────────────────────────────
  const [showCorporateAccount, setShowCorporateAccount]     = useState(false);
  const [showCorporateSolutions, setShowCorporateSolutions] = useState(false);
  const [showCorporateLoan, setShowCorporateLoan]           = useState(false);
  const [showCorporateLoanApp, setShowCorporateLoanApp]     = useState(false);
  const [showCorporateApi, setShowCorporateApi]             = useState(false);
  const [showCorporateEvents, setShowCorporateEvents]       = useState(false);
  const [showCorporateCSR, setShowCorporateCSR]             = useState(false);

  // ── Operations / Admin ────────────────────────────────────────────────────
  const [showGlobalBanking, setShowGlobalBanking]           = useState(false);
  const [showFinancialReports, setShowFinancialReports]     = useState(false);
  const [showFoodDelivery, setShowFoodDelivery]             = useState(false);
  const [showAdminDashboard, setShowAdminDashboard]         = useState(false);
  const [showAFCDashboard, setShowAFCDashboard]             = useState(false);
  const [showAdminApps, setShowAdminApps]                   = useState(false);
  const [showGlobalSIM, setShowGlobalSIM]                   = useState(false);
  const [showCardNetwork, setShowCardNetwork]               = useState(false);
  const [showInvestorRelations, setShowInvestorRelations]   = useState(false);

  // ── Footer pages ──────────────────────────────────────────────────────────
  const [showAboutVINK, setShowAboutVINK]                     = useState(false);
  const [showCareers, setShowCareers]                       = useState(false);
  const [showNews, setShowNews]                             = useState(false);
  const [showContactUs, setShowContactUs]                   = useState(false);
  const [showSwitchToVINK, setShowSwitchToVINK]               = useState(false);
  const [show500App, setShow500App]                         = useState(false);

  // ── Login state ───────────────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn]                         = useState(false);
  const [showManagementHub, setShowManagementHub]           = useState(false);
  const [showTaxiAssociations, setShowTaxiAssociations]     = useState(false);
  const [userRole, setUserRole]                             = useState<string>("personal");
  const [showLogin, setShowLogin]                           = useState(false);

  // ── Health check ──────────────────────────────────────────────────────────
  useEffect(() => { checkHealth().catch(() => {}); }, []);

  // ── Body scroll lock ──────────────────────────────────────────────────────
  const anyOverlayOpen = mounted.size > 0 && Array.from(mounted).some(k => {
    const stateMap: Record<string, boolean> = {
      postLogin: showPostLogin, mobileNetwork: showMobileNetwork, driver: showDriver,
      rider: showRider, rideHailing: showRideHailing, banking: showBanking,
      owners: showOwners, investors: showInvestors, marshall: showMarshall,
      merchant: showMerchant, authority: showAuthority, superAdmin: showSuperAdmin,
      vehicle: showVehicle, appLauncher: showAppLauncher, afcApp: showAFCApp,
    };
    return stateMap[k] ?? false;
  });
  useBodyScrollLock(anyOverlayOpen);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const open = (key: string, fn: () => void) => startTransition(() => { mount(key); fn(); });

  const handleDashboardSelect = (id: string) => {
    startTransition(() => {
      if      (id === "vinkapp")           { mount("vinkMobileApp");    setShowVinkMobileApp(true); }
      else if (id === "globalbanking")     { mount("globalBanking");    setShowGlobalBanking(true); }
      else if (id === "financialreports")  { mount("financialReports"); setShowFinancialReports(true); }
      else if (id === "fooddelivery")      { mount("foodDelivery");     setShowFoodDelivery(true); }
      else if (id === "afc")               { mount("afcDashboard");     setShowAFCDashboard(true); }
      else if (id === "admin")             { mount("adminDashboard");   setShowAdminDashboard(true); }
      else if (id === "mobile")            { mount("mobileNetwork");    setShowMobileNetwork(true); }
      else if (id === "globalsim")         { mount("globalSIM");        setShowGlobalSIM(true); }
      else if (id === "cardnetwork")       { mount("cardNetwork");      setShowCardNetwork(true); }
      else if (id === "driver")            { mount("driver");           setShowDriver(true); }
      else if (id === "passenger")         { mount("rider");            setShowRider(true); }
      else if (id === "owner")             { mount("owners");           setShowOwners(true); }
      else if (id === "investor")          { mount("investors");        setShowInvestors(true); }
      else if (id === "marshall")          { mount("marshall");         setShowMarshall(true); }
      else if (id === "merchant")          { mount("merchant");         setShowMerchant(true); }
      else if (id === "authority")         { mount("authority");        setShowAuthority(true); }
      else if (id === "superadmin")        { mount("superAdmin");       setShowSuperAdmin(true); }
      else if (id === "connect")           { mount("mobileNetwork");    setShowMobileNetwork(true); }
      else if (id === "guardme")           { mount("vehicle");          setShowVehicle(true); }
      else if (id === "devices")           { mount("afcDashboard");     setShowAFCDashboard(true); }
      else if (id === "finance")           { mount("financialReports"); setShowFinancialReports(true); }
      else if (id === "business")          { mount("banking");          setShowBanking(true); }
      else if (id === "ridehailing")       { mount("rideHailing");      setShowRideHailing(true); }
      else if (id === "account")           { mount("banking");          setShowBanking(true); }
      else if (id === "vehicle")           { mount("vehicle");          setShowVehicle(true); }
      else if (id === "marketplace")       { mount("marketplace");      setShowMarketplace(true); }
      else if (id === "appLauncher")       { mount("appLauncher");      setShowAppLauncher(true); }
      else if (id === "afcApp")            { mount("afcApp");           setShowAFCApp(true); }
      else                                 { mount("postLogin");        setShowPostLogin(true); }
    });
  };

  const handleHomeNavigate = (id: string) => {
    startTransition(() => {
      setShowPostLogin(false);
      switch (id) {
        // Transport & Devices
        case "driver":       mount("driver");           setShowDriver(true);           break;
        case "passenger":    mount("rider");            setShowRider(true);            break;
        case "travel":       mount("rideHailing");      setShowRideHailing(true);      break;
        case "scantopay":    mount("vinkPassengerApp"); setShowVinkPassengerApp(true); break;
        case "device":       mount("afcApp");           setShowAFCApp(true);           break;
        case "vehicle":      mount("vehicle");          setShowVehicle(true);          break;
        case "restaurant":   mount("foodDelivery");     setShowFoodDelivery(true);     break;
        // Banking & Payments
        case "account":      mount("banking");          setShowBanking(true);          break;
        case "payments":
        case "transfer":
        case "cardless":
        case "qr":
        case "login":        mount("vinkBankingApp");   setShowVinkBankingApp(true);   break;
        case "cards":        mount("creditCard");       setShowCreditCard(true);       break;
        case "forex":        mount("globalBanking");    setShowGlobalBanking(true);    break;
        // Insurance & Rewards
        case "guardme":
        case "insurance":    mount("insure");           setShowInsure(true);           break;
        case "rewards":      mount("rewards");          setShowRewards(true);          break;
        // Connectivity
        case "connect":
        case "mobile":
        case "vinktv":        mount("mobileNetwork");    setShowMobileNetwork(true);    break;
        // Commerce
        case "marketplace":  mount("marketplace");      setShowMarketplace(true);      break;
        case "buy":
        case "settings":     mount("vinkMobileApp");    setShowVinkMobileApp(true);    break;
        // Contact & Support
        case "message":
        case "contact":      mount("contactUs");        setShowContactUs(true);        break;
        // Elections / fallback
        case "elections":    mount("globalBanking");    setShowGlobalBanking(true);    break;
        default:             mount("postLogin");        setShowPostLogin(true);        break;
      }
    });
  };

  const openSelector = useCallback((cat: NonNullable<typeof selectorCategory>) => {
    startTransition(() => {
      mount("productSelector");
      setSelectorCategory(cat);
      setSelectorOpen(true);
    });
  }, [mount]);

  const applyForProductCategory = (category: "creditCard" | "loan" | "invest" | "insure" | "rewards") => {
    startTransition(() => {
      if (category === "invest")      { mount("investApp");     setShowInvestApp(true); }
      else if (category === "insure") { mount("insureApp");     setShowInsureApp(true); }
      else if (category === "rewards"){ mount("rewardsApp");    setShowRewardsApp(true); }
      else if (category === "creditCard") { mount("creditCardApp"); setShowCreditCardApp(true); }
      else if (category === "loan")   { mount("bizLoanApp");    setShowBusinessLoanApp(true); }
    });
  };

  const navigateBusinessItem = (item: string) => {
    setShowBusinessLedger(false);
    setShowBusinessAccountSelector(false);
    setShowStartBusiness(false);
    setShowManageBusiness(false);
    setShowBusinessInternational(false);
    setShowBusinessStudio(false);
    setShowBusinessNews(false);
    if (item === "Start My Business") { mount("startBusiness");    setShowStartBusiness(true); return; }
    if (item === "Accounts")          { mount("bizAccountSelector"); setShowBusinessAccountSelector(true); return; }
    if (item === "Credit Cards")      { mount("bizLedger"); setBusinessLedgerCategory("creditCard"); setShowBusinessLedger(true); return; }
    if (item === "Loans")             { mount("bizLedger"); setBusinessLedgerCategory("loan"); setShowBusinessLedger(true); return; }
    if (item === "Invest")            { mount("bizLedger"); setBusinessLedgerCategory("invest"); setShowBusinessLedger(true); return; }
    if (item === "Insure")            { mount("bizLedger"); setBusinessLedgerCategory("insure"); setShowBusinessLedger(true); return; }
    if (item === "Manage My Business"){ mount("manageBusiness");   setShowManageBusiness(true); return; }
    if (item === "International")     { mount("bizInternational"); setShowBusinessInternational(true); return; }
    if (item === "Studio")            { mount("bizStudio");        setShowBusinessStudio(true); return; }
    if (item === "News")              { mount("bizNews");          setShowBusinessNews(true); return; }
  };

  const handleSubNavClick = (item: string) => {
    startTransition(() => {
      if (item === "Business:Insure")   { mount("bizLedger");          setBusinessLedgerCategory("insure"); setShowBusinessLedger(true); return; }
      if (item === "Business:Invest")   { mount("bizLedger");          setBusinessLedgerCategory("invest"); setShowBusinessLedger(true); return; }
      // Personal — through product selector
     if (item === "Account")           { mount("personalAccount"); setShowPersonalAccount(true); return; }
      if (item === "Credit Card")       { mount("personalAccount"); mount("personalLedger"); setLedgerCategory("creditCard"); setShowPersonalLedger(true); return; }
      if (item === "Loan")              { mount("personalAccount"); mount("personalLedger"); setLedgerCategory("loan"); setShowPersonalLedger(true); return; }
      if (item === "Invest")            { mount("personalAccount"); mount("personalLedger"); setLedgerCategory("invest"); setShowPersonalLedger(true); return; }
      if (item === "Insure")            { mount("personalAccount"); mount("personalLedger"); setLedgerCategory("insure"); setShowPersonalLedger(true); return; }
      if (item === "Rewards")           { mount("personalAccount"); mount("personalLedger"); setLedgerCategory("rewards"); setShowPersonalLedger(true); return; }
      if (item === "SIM")               return openSelector("sim");
      // Business — Header.tsx's BUSINESS_SUB_NAV sends these exact bare labels
      if (item === "Start My Business") { mount("startBusiness");      setShowStartBusiness(true); return; }
      if (item === "Accounts")          { mount("bizAccountSelector"); setShowBusinessAccountSelector(true); return; }
      if (item === "Credit Cards")      { mount("bizLedger");          setBusinessLedgerCategory("creditCard"); setShowBusinessLedger(true); return; }
      if (item === "Loans")             { mount("bizLedger");          setBusinessLedgerCategory("loan"); setShowBusinessLedger(true); return; }
      if (item === "Manage My Business"){ mount("manageBusiness");     setShowManageBusiness(true); return; }
      if (item === "International")     { mount("bizInternational");   setShowBusinessInternational(true); return; }
      if (item === "Studio")            { mount("bizStudio");          setShowBusinessStudio(true); return; }
      if (item === "News")              { mount("bizNews");            setShowBusinessNews(true); return; }
      // Corporate — Header.tsx's CORPORATE_SUB_NAV items are dispatched with a
      // "Corporate:" prefix (see handleNavClick's onClick for CORPORATE_SUB_NAV),
      // so matches must include that prefix and the exact sub-nav label.
      if (item === "Corporate:Account")                  { mount("corpAccount");   setShowCorporateAccount(true); return; }
      if (item === "Corporate:Solutions & Credit Cards")  { mount("corpSolutions"); setShowCorporateSolutions(true); return; }
      if (item === "Corporate:Loan")                      { mount("corpLoan");      setShowCorporateLoan(true); return; }
      if (item === "Corporate:API")                       { mount("corpApi");       setShowCorporateApi(true); return; }
      if (item === "Corporate:Events")                    { mount("corpEvents");    setShowCorporateEvents(true); return; }
      if (item === "Corporate:Social Responsibility")     { mount("corpCSR");       setShowCorporateCSR(true); return; }
      // Marketplace
      if (item === "Marketplace")       { mount("marketplace");        setShowMarketplace(true); return; }
    });
  };

  const handleMobileNavigate = (id: string) => {
    startTransition(() => {
      setShowVinkMobileApp(false);
      if      (id === "banking")     { mount("vinkBankingApp");  setShowVinkBankingApp(true); }
      else if (id === "driver")      { mount("vinkDriverApp");   setShowVinkDriverApp(true); }
      else if (id === "passenger")   { mount("vinkPassengerApp");setShowVinkPassengerApp(true); }
      else if (id === "afc")         { mount("afcApp");          setShowAFCApp(true); }
      else if (id === "tracking")    { mount("vehicleTrackingApp"); setShowVehicleTrackingApp(true); }
      else if (id === "food")        { mount("foodDelivery");    setShowFoodDelivery(true); }
      else if (id === "ride")        { mount("rideHailing");     setShowRideHailing(true); }
    });
  };

  const handleFooterLink = (label: string) => {
    startTransition(() => {
      if (label === "About VINK")                                 open("aboutVINK",          () => setShowAboutVINK(true));
      if (label === "Investor Relations")                        open("investorRelations",  () => setShowInvestorRelations(true));
      if (label === "Careers")                                   open("careers",            () => setShowCareers(true));
      if (label === "News")                                      open("news",               () => setShowNews(true));
      if (label === "Contact Us")                                open("contactUs",          () => setShowContactUs(true));
      if (label === "Switch to VINK")                             open("switchToVINK",        () => setShowSwitchToVINK(true));
      if (label === "500 Global Application")                    open("500app",             () => setShow500App(true));
      if (label === "Browse Apps")                               startTransition(() => { mount("appLauncher"); setShowAppLauncher(true); });
      if (label === "Investor Relations")                        open("investorRelations",  () => setShowInvestorRelations(true));
      if (label === "Get Help & Information")                    open("contactUs",          () => setShowContactUs(true));
      if (label === "Message Us")                                open("contactUs",          () => setShowContactUs(true));
    });
  };

  const handleSelectorSelect = (type: string, productId: string) => {
    setSelectorOpen(false);
    startTransition(() => {
      if (type === "invest")     { mount("investApp");      setShowInvestApp(true); }
      else if (type === "insure"){ mount("insureApp");      setShowInsureApp(true); }
      else if (type === "rewards"){ mount("rewardsApp");    setShowRewardsApp(true); }
      else if (type === "sim")   { mount("simApp");         setShowSIMServiceApp(true); }
      else if (type === "account"){ mount("accountApp");    setShowAccountApp(true); }
      else if (type === "creditCard") { mount("creditCardApp"); setShowCreditCardApp(true); }
      else if (type === "loan")  { mount("bizLoanApp");     setShowBusinessLoanApp(true); }
    });
  };

  return (
    <div className="min-h-screen bg-white">
      <Toaster position="top-right" richColors closeButton duration={4000} />

      {/* ── Homepage ────────────────────────────────────────────────────────── */}
      <ErrorBoundary>
        <Header
          onDashboardSelect={(id) => {
            setIsLoggedIn(true);
            setUserRole(id);
            handleDashboardSelect(id);
          }}
          onSubNavClick={handleSubNavClick}
          onOpenProfile={() => startTransition(() => { mount("postLogin"); setShowPostLogin(true); })}
          isLoggedIn={isLoggedIn}
          userName={userRole || undefined}
        />
      </ErrorBoundary>

      <ErrorBoundary>
        <HeroSection onApplyClick={() => openSelector("account")} />
      </ErrorBoundary>

      <SearchSection />

      <LazySection><Suspense fallback={null}><FeaturesSection /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><ProtectionSection /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><WorldMapSection /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><CreditCardsSection onApply={() => openSelector("creditCard")} /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><BusinessPowerSection onSubNavClick={handleSubNavClick} /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><PreApprovalSection onApply={() => openSelector("loan")} /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><FeaturedOffersSection /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><SpecialNeedSection /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><FinancialInstitutionsSection /></Suspense></LazySection>
      {/* AppShowcaseSection removed from homepage — accessible via footer "Download the App Now!" only */}
      <LazySection>
        <Suspense fallback={null}>
          <Footer onLinkClick={handleFooterLink} />
        </Suspense>
      </LazySection>

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}

      {/* Post-login */}
      {has("postLogin")       && <Suspense fallback={null}><PostLoginHome          isOpen={showPostLogin}       onClose={() => setShowPostLogin(false)}    onNavigate={handleHomeNavigate} onDashboardSelect={handleDashboardSelect} /></Suspense>}
      {has("mobileNetwork")   && <Suspense fallback={null}><MobileNetworkDashboard isOpen={showMobileNetwork}   onClose={() => setShowMobileNetwork(false)} /></Suspense>}
      {has("driver")          && <Suspense fallback={null}><DriverDashboard        isOpen={showDriver}          onClose={() => setShowDriver(false)} /></Suspense>}
      {has("rider")           && <Suspense fallback={null}><PassengerDashboard     isOpen={showRider}           onClose={() => setShowRider(false)} onBookRide={() => startTransition(() => { setShowRider(false); mount("rideHailing"); setShowRideHailing(true); })} /></Suspense>}
      {has("owners")          && <Suspense fallback={null}><OwnersDashboard        isOpen={showOwners}          onClose={() => setShowOwners(false)} /></Suspense>}
      {has("investors")       && <Suspense fallback={null}><InvestorsDashboard     isOpen={showInvestors}       onClose={() => setShowInvestors(false)} /></Suspense>}
      {has("marshall")        && <Suspense fallback={null}><MarshallDashboard      isOpen={showMarshall}        onClose={() => setShowMarshall(false)} /></Suspense>}
      {has("merchant")        && <Suspense fallback={null}><MerchantDashboard      isOpen={showMerchant}        onClose={() => setShowMerchant(false)} /></Suspense>}
      {has("authority")       && <Suspense fallback={null}><AuthorityDashboard     isOpen={showAuthority}       onClose={() => setShowAuthority(false)} /></Suspense>}
      {has("superAdmin")      && <Suspense fallback={null}><SuperAdminDashboard    isOpen={showSuperAdmin}      onClose={() => setShowSuperAdmin(false)} /></Suspense>}
      {has("rideHailing")     && <Suspense fallback={null}><RideHailingSystem      isOpen={showRideHailing}     onClose={() => setShowRideHailing(false)} /></Suspense>}
      {has("banking")         && <Suspense fallback={null}><BankingDashboard       isOpen={showBanking}         onClose={() => setShowBanking(false)} /></Suspense>}
      {has("vehicle")         && <Suspense fallback={null}><VehicleTrackingDashboard isOpen={showVehicle}       onClose={() => setShowVehicle(false)} /></Suspense>}
      {has("marketplace")     && <Suspense fallback={null}><VinkMarketplace        isOpen={showMarketplace}     onClose={() => setShowMarketplace(false)} /></Suspense>}

      {/* Personal products */}
      {has("personalAccount") && <Suspense fallback={null}><PersonalAccountViewer  isOpen={showPersonalAccount} onClose={() => setShowPersonalAccount(false)} onNavigate={(cat) => { setShowPersonalAccount(false); setLedgerCategory(cat); setShowPersonalLedger(true); }} /></Suspense>}
      {has("personalLedger")  && <Suspense fallback={null}><PersonalProductLedgerViewer isOpen={showPersonalLedger} onClose={() => setShowPersonalLedger(false)} initialCategory={ledgerCategory} onNavigateToAccount={() => { setShowPersonalLedger(false); setShowPersonalAccount(true); }} onApply={applyForProductCategory} /></Suspense>}
      {has("creditCard")      && <Suspense fallback={null}><CreditCardViewer       isOpen={showCreditCard}      onClose={() => setShowCreditCard(false)} /></Suspense>}
      {has("creditCardApp")   && <Suspense fallback={null}><CreditCardApplicationViewer isOpen={showCreditCardApp} onClose={() => setShowCreditCardApp(false)} /></Suspense>}
      {has("loan")            && <Suspense fallback={null}><LoanViewer             isOpen={showLoan}            onClose={() => setShowLoan(false)} /></Suspense>}
      {has("invest")          && <Suspense fallback={null}><InvestViewer           isOpen={showInvest}          onClose={() => setShowInvest(false)} /></Suspense>}
      {has("insure")          && <Suspense fallback={null}><InsureViewer           isOpen={showInsure}          onClose={() => setShowInsure(false)} /></Suspense>}
      {has("rewards")         && <Suspense fallback={null}><RewardsViewer          isOpen={showRewards}         onClose={() => setShowRewards(false)} /></Suspense>}
      {has("investApp")       && <Suspense fallback={null}><ServiceApplicationViewer serviceType="invest"   isOpen={showInvestApp}     onClose={() => setShowInvestApp(false)} /></Suspense>}
      {has("insureApp")       && <Suspense fallback={null}><ServiceApplicationViewer serviceType="insure"   isOpen={showInsureApp}     onClose={() => setShowInsureApp(false)} /></Suspense>}
      {has("rewardsApp")      && <Suspense fallback={null}><ServiceApplicationViewer serviceType="rewards"  isOpen={showRewardsApp}    onClose={() => setShowRewardsApp(false)} /></Suspense>}
      {has("simApp")          && <Suspense fallback={null}><ServiceApplicationViewer serviceType="sim"      isOpen={showSIMServiceApp} onClose={() => setShowSIMServiceApp(false)} /></Suspense>}
      {has("accountApp")      && <Suspense fallback={null}><ServiceApplicationViewer serviceType="account"  isOpen={showAccountApp}    onClose={() => setShowAccountApp(false)} /></Suspense>}
      {has("clubBooking")     && <Suspense fallback={null}><ClubBookingViewer      isOpen={showClubBooking}     onClose={() => setShowClubBooking(false)} /></Suspense>}

      {/* Product selector */}
      {has("productSelector") && <Suspense fallback={null}><ProductSelectorViewer  isOpen={selectorOpen} category={selectorCategory} onClose={() => setSelectorOpen(false)} onSelect={handleSelectorSelect} /></Suspense>}

      {/* Business */}
      {has("startBusiness")      && <Suspense fallback={null}><StartMyBusinessViewer       isOpen={showStartBusiness}       onClose={() => setShowStartBusiness(false)} onNavigate={navigateBusinessItem} /></Suspense>}
      {has("bizAccountSelector") && <Suspense fallback={null}><BusinessAccountSelectorViewer isOpen={showBusinessAccountSelector} onClose={() => setShowBusinessAccountSelector(false)} onNavigate={(item) => navigateBusinessItem(item)} onApply={(type) => { setShowBusinessAccountSelector(false); mount("bizAccounts"); setChosenBusinessAccountType(type); setShowBusinessAccounts(true); }} /></Suspense>}
      {has("bizAccounts")        && <Suspense fallback={null}><BusinessAccountApplicationViewer isOpen={showBusinessAccounts} onClose={() => setShowBusinessAccounts(false)} initialAccountType={chosenBusinessAccountType} /></Suspense>}
      {has("bizLedger") && <Suspense fallback={null}><BusinessProductLedgerViewer isOpen={showBusinessLedger} onClose={() => setShowBusinessLedger(false)} initialCategory={businessLedgerCategory} onNavigate={(item) => navigateBusinessItem(item)} onApply={applyForProductCategory} /></Suspense>}
      {has("bizLoanApp")         && <Suspense fallback={null}><BusinessLoanApplicationViewer isOpen={showBusinessLoanApp}   onClose={() => setShowBusinessLoanApp(false)} /></Suspense>}
      {has("manageBusiness")     && <Suspense fallback={null}><ManageMyBusinessViewer      isOpen={showManageBusiness}      onClose={() => setShowManageBusiness(false)} onNavigate={navigateBusinessItem} /></Suspense>}
      {has("bizInternational")   && <Suspense fallback={null}><BusinessInternationalViewer isOpen={showBusinessInternational} onClose={() => setShowBusinessInternational(false)} onNavigate={navigateBusinessItem} /></Suspense>}
      {has("bizStudio")          && <Suspense fallback={null}><BusinessStudioViewer        isOpen={showBusinessStudio}      onClose={() => setShowBusinessStudio(false)} onNavigate={navigateBusinessItem} /></Suspense>}
      {has("bizNews")            && <Suspense fallback={null}><BusinessNewsViewer          isOpen={showBusinessNews}        onClose={() => setShowBusinessNews(false)} onNavigate={navigateBusinessItem} /></Suspense>}

      {/* Corporate */}
      {has("corpAccount")        && <Suspense fallback={null}><CorporateAccountViewer      isOpen={showCorporateAccount}    onClose={() => setShowCorporateAccount(false)} /></Suspense>}
      {has("corpSolutions")      && <Suspense fallback={null}><CorporateSolutionsViewer    isOpen={showCorporateSolutions}  onClose={() => setShowCorporateSolutions(false)} /></Suspense>}
      {has("corpLoan")           && <Suspense fallback={null}><CorporateLoanViewer         isOpen={showCorporateLoan}       onClose={() => setShowCorporateLoan(false)} /></Suspense>}
      {has("corpLoanApp")        && <Suspense fallback={null}><CorporateLoanApplicationViewer isOpen={showCorporateLoanApp} onClose={() => setShowCorporateLoanApp(false)} /></Suspense>}
      {has("corpApi")            && <Suspense fallback={null}><CorporateApiViewer          isOpen={showCorporateApi}        onClose={() => setShowCorporateApi(false)} /></Suspense>}
      {has("corpEvents")         && <Suspense fallback={null}><CorporateEventsViewer       isOpen={showCorporateEvents}     onClose={() => setShowCorporateEvents(false)} /></Suspense>}
      {has("corpCSR")            && <Suspense fallback={null}><CorporateSocialResponsibilityViewer isOpen={showCorporateCSR} onClose={() => setShowCorporateCSR(false)} /></Suspense>}

      {/* Operations */}
      {has("globalBanking")      && <Suspense fallback={null}><GlobalBankingDashboard      isOpen={showGlobalBanking}       onClose={() => setShowGlobalBanking(false)} /></Suspense>}
      {has("financialReports")   && <Suspense fallback={null}><FinancialReportsViewer      isOpen={showFinancialReports}    onClose={() => setShowFinancialReports(false)} /></Suspense>}
      {has("foodDelivery")       && <Suspense fallback={null}><FoodDeliveryApp             isOpen={showFoodDelivery}        onClose={() => setShowFoodDelivery(false)} /></Suspense>}
      {has("adminDashboard")     && <Suspense fallback={null}><AdminDashboard             isOpen={showAdminDashboard}      onClose={() => setShowAdminDashboard(false)} /></Suspense>}
      {has("afcDashboard")       && <Suspense fallback={null}><AFCManagementDashboard     isOpen={showAFCDashboard}        onClose={() => setShowAFCDashboard(false)} /></Suspense>}
      {has("adminApps")          && <Suspense fallback={null}><AdminApplicationsViewer    isOpen={showAdminApps}           onClose={() => setShowAdminApps(false)} /></Suspense>}
      {has("globalSIM")          && <Suspense fallback={null}><GlobalSIMDashboard         isOpen={showGlobalSIM}           onClose={() => setShowGlobalSIM(false)} /></Suspense>}
      {has("cardNetwork")        && <Suspense fallback={null}><CardNetworkDashboard       isOpen={showCardNetwork}         onClose={() => setShowCardNetwork(false)} /></Suspense>}
      {has("investorRelations")  && <Suspense fallback={null}><InvestorRelationsViewer    isOpen={showInvestorRelations}   onClose={() => setShowInvestorRelations(false)} /></Suspense>}

      {/* Mobile apps */}
      {has("afcApp")             && <Suspense fallback={null}><AFCApp                isOpen={showAFCApp}             onClose={() => setShowAFCApp(false)} /></Suspense>}
      {has("revenueDash")        && <Suspense fallback={null}><RevenueDashboard      isOpen={showRevenueDashboard}   onClose={() => setShowRevenueDashboard(false)} /></Suspense>}
      {has("vehicleTrackingApp") && <Suspense fallback={null}><VehicleTrackingApp    isOpen={showVehicleTrackingApp} onClose={() => setShowVehicleTrackingApp(false)} /></Suspense>}
      {has("vinkBankingApp")     && <Suspense fallback={null}><VinkBankingApp        isOpen={showVinkBankingApp}     onClose={() => setShowVinkBankingApp(false)} /></Suspense>}
      {has("vinkDriverApp")      && <Suspense fallback={null}><VinkDriverApp         isOpen={showVinkDriverApp}      onClose={() => setShowVinkDriverApp(false)} /></Suspense>}
      {has("vinkPassengerApp")   && <Suspense fallback={null}><VinkPassengerApp      isOpen={showVinkPassengerApp}   onClose={() => setShowVinkPassengerApp(false)} onOpenClubBooking={() => startTransition(() => { mount("clubBooking"); setShowClubBooking(true); })} onBookRide={() => startTransition(() => { setShowVinkPassengerApp(false); mount("rideHailing"); setShowRideHailing(true); })} /></Suspense>}
      {has("vinkMobileApp")      && <Suspense fallback={null}><VinkMobileApp         isOpen={showVinkMobileApp}      onClose={() => setShowVinkMobileApp(false)} onNavigate={handleMobileNavigate} /></Suspense>}
      {has("appLauncher")        && <Suspense fallback={null}><AppLauncher           isOpen={showAppLauncher}        onClose={() => setShowAppLauncher(false)} onLaunchApp={(id) => {
        startTransition(() => {
          setShowAppLauncher(false);
          if (id === "afc")       { mount("afcApp");             setShowAFCApp(true); }
          if (id === "revenue")   { mount("revenueDash");        setShowRevenueDashboard(true); }
          if (id === "tracking")  { mount("vehicleTrackingApp"); setShowVehicleTrackingApp(true); }
          if (id === "banking")   { mount("vinkBankingApp");     setShowVinkBankingApp(true); }
          if (id === "driver")    { mount("vinkDriverApp");      setShowVinkDriverApp(true); }
          if (id === "passenger") { mount("vinkPassengerApp");   setShowVinkPassengerApp(true); }
          if (id === "food")      { mount("foodDelivery");       setShowFoodDelivery(true); }
          if (id === "ride")      { mount("rideHailing");        setShowRideHailing(true); }
        });
      }} /></Suspense>}

      {/* Footer pages */}
      {has("aboutVINK")           && <Suspense fallback={null}><AboutVINKViewer       isOpen={showAboutVINK}           onClose={() => setShowAboutVINK(false)} /></Suspense>}
      {has("careers")            && <Suspense fallback={null}><CareersViewer        isOpen={showCareers}            onClose={() => setShowCareers(false)} /></Suspense>}
      {has("news")               && <Suspense fallback={null}><NewsViewer           isOpen={showNews}               onClose={() => setShowNews(false)} /></Suspense>}
      {has("contactUs")          && <Suspense fallback={null}><ContactUsViewer            isOpen={showContactUs}  onClose={() => setShowContactUs(false)} /></Suspense>}
      {has("switchToVINK")        && <Suspense fallback={null}><SwitchToVINKViewer          isOpen={showSwitchToVINK} onClose={() => setShowSwitchToVINK(false)} /></Suspense>}
      {has("managementHub")      && <Suspense fallback={null}><ManagementHub              isOpen={showManagementHub}       onClose={() => setShowManagementHub(false)} /></Suspense>}
      {has("taxiAssociations")   && <Suspense fallback={null}><TaxiAssociationsViewer       isOpen={showTaxiAssociations} onClose={() => setShowTaxiAssociations(false)} /></Suspense>}
      {has("500app")             && <Suspense fallback={null}><FiveHundredGlobalApplication isOpen={show500App}          onClose={() => setShow500App(false)} /></Suspense>}
    </div>
  );
}
