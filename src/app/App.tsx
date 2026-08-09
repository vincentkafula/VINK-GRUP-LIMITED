import { useState, lazy, Suspense, startTransition, useEffect, useCallback } from "react";
import { Toaster } from "sonner";
import { checkHealth, getSession, startHealthRecoveryWatch } from "./services/apiClient";
import { Header } from "./components/Header";
import { SearchSection } from "./components/SearchSection";
import { HeroSection } from "./components/HeroSection";
import { LazySection } from "./components/LazySection";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useBodyScrollLock } from "./hooks/useBodyScrollLock";

// ─── Below-fold homepage sections — code-split ────────────────────────────────
const FeaturesSection              = lazy(() => import("./components/FeaturesSection").then(m => ({ default: m.FeaturesSection })));
const ProtectionSection            = lazy(() => import("./components/ProtectionSection").then(m => ({ default: m.ProtectionSection })));
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
const ManagementPanelViewer       = lazy(() => import("./components/ManagementPanelViewer").then(m => ({ default: m.ManagementPanelViewer })));
const VehicleTrackingDashboard    = lazy(() => import("./components/VehicleTrackingDashboard").then(m => ({ default: m.VehicleTrackingDashboard })));
const VinkMarketplace             = lazy(() => import("./components/VinkMarketplace").then(m => ({ default: m.VinkMarketplace })));
import { PersistentTopNav } from "./components/PersistentTopNav";
const MarketplaceLandingViewer    = lazy(() => import("./components/MarketplaceLandingViewer").then(m => ({ default: m.MarketplaceLandingViewer })));
const PersonalAccountViewer       = lazy(() => import("./components/PersonalAccountViewer").then(m => ({ default: m.PersonalAccountViewer })));
const PersonalLandingViewer       = lazy(() => import("./components/PersonalLandingViewer").then(m => ({ default: m.PersonalLandingViewer })));
const SafetySecurityViewer        = lazy(() => import("./components/footerPages/SafetySecurityViewer").then(m => ({ default: m.SafetySecurityViewer })));
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
const CorporateProductLedgerViewer = lazy(() => import("./components/CorporateProductLedgerViewer").then(m => ({ default: m.CorporateProductLedgerViewer })));
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
const VinkBusinessBankingApp      = lazy(() => import("./components/apps/VinkBusinessBankingApp").then(m => ({ default: m.VinkBusinessBankingApp })));
const VinkCorporateBankingApp     = lazy(() => import("./components/apps/VinkCorporateBankingApp").then(m => ({ default: m.VinkCorporateBankingApp })));
const VinkDriverApp               = lazy(() => import("./components/apps/VinkDriverApp").then(m => ({ default: m.VinkDriverApp })));
const VinkPassengerApp            = lazy(() => import("./components/apps/VinkPassengerApp").then(m => ({ default: m.VinkPassengerApp })));
const VinkMobileApp               = lazy(() => import("./components/apps/VinkMobileApp").then(m => ({ default: m.VinkMobileApp })));
const AppLauncher                 = lazy(() => import("./components/apps/AppLauncher").then(m => ({ default: m.AppLauncher })));
const AboutVINKViewer              = lazy(() => import("./components/footerPages/AboutVINKViewer").then(m => ({ default: m.AboutVINKViewer })));
const LegalComplianceViewer         = lazy(() => import("./components/footerPages/LegalComplianceViewer").then(m => ({ default: m.LegalComplianceViewer })));
const CareersViewer               = lazy(() => import("./components/footerPages/CareersViewer").then(m => ({ default: m.CareersViewer })));
const NewsViewer                  = lazy(() => import("./components/footerPages/NewsViewer").then(m => ({ default: m.NewsViewer })));
const ContactUsViewer             = lazy(() => import("./components/footerPages/ContactUsViewer").then(m => ({ default: m.ContactUsViewer })));
const SwitchToVINKViewer           = lazy(() => import("./components/footerPages/SwitchToVINKViewer").then(m => ({ default: m.SwitchToVINKViewer })));
const BranchLocatorViewer          = lazy(() => import("./components/footerPages/BranchLocatorViewer").then(m => ({ default: m.BranchLocatorViewer })));
const SponsorshipViewer            = lazy(() => import("./components/footerPages/SponsorshipViewer").then(m => ({ default: m.SponsorshipViewer })));
const WEFViewer                    = lazy(() => import("./components/footerPages/WEFViewer").then(m => ({ default: m.WEFViewer })));
const BankingFeesViewer            = lazy(() => import("./components/footerPages/BankingFeesViewer").then(m => ({ default: m.BankingFeesViewer })));
const BankingGuideViewer           = lazy(() => import("./components/footerPages/BankingGuideViewer").then(m => ({ default: m.BankingGuideViewer })));
const BankingChannelsViewer        = lazy(() => import("./components/footerPages/BankingChannelsViewer").then(m => ({ default: m.BankingChannelsViewer })));
const ExchangeRatesViewer          = lazy(() => import("./components/footerPages/ExchangeRatesViewer").then(m => ({ default: m.ExchangeRatesViewer })));
const LatestOffersViewer           = lazy(() => import("./components/footerPages/LatestOffersViewer").then(m => ({ default: m.LatestOffersViewer })));
const MarketIndicesViewer          = lazy(() => import("./components/footerPages/MarketIndicesViewer").then(m => ({ default: m.MarketIndicesViewer })));
const VinkBlogViewer               = lazy(() => import("./components/footerPages/VinkBlogViewer").then(m => ({ default: m.VinkBlogViewer })));
const FiveHundredGlobalApplication = lazy(() => import("./components/FiveHundredGlobalApplication").then(m => ({ default: m.FiveHundredGlobalApplication })));
const JobApplicationViewer = lazy(() => import("./components/JobApplicationViewer").then(m => ({ default: m.JobApplicationViewer })));
const NewsManagementDashboard = lazy(() => import("./components/NewsManagementDashboard").then(m => ({ default: m.NewsManagementDashboard })));
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
  const [showManagementPanel, setShowManagementPanel]       = useState(false);
  const [showVehicle, setShowVehicle]                       = useState(false);
  const [showSIMApp, setShowSIMApp]                         = useState(false);
  const [showMarketplace, setShowMarketplace]               = useState(false);

  // ── Super App Ecosystem ────────────────────────────────────────────────────
  const [showAFCApp, setShowAFCApp]                         = useState(false);
  const [showVehicleTrackingApp, setShowVehicleTrackingApp] = useState(false);
  const [showVinkBankingApp, setShowVinkBankingApp]         = useState(false);
  const [showVinkBusinessBankingApp, setShowVinkBusinessBankingApp] = useState(false);
  const [showVinkCorporateBankingApp, setShowVinkCorporateBankingApp] = useState(false);
  const [showVinkDriverApp, setShowVinkDriverApp]           = useState(false);
  const [showVinkPassengerApp, setShowVinkPassengerApp]     = useState(false);
  const [showVinkMobileApp, setShowVinkMobileApp]           = useState(false);
  const [showAppLauncher, setShowAppLauncher]               = useState(false);
  const [showRevenueDashboard, setShowRevenueDashboard]     = useState(false);

  // ── Personal products ──────────────────────────────────────────────────────
  const [showPersonalLanding, setShowPersonalLanding]       = useState(false);
  const [showMarketplaceLanding, setShowMarketplaceLanding] = useState(false);
  const [marketplaceInitialAction, setMarketplaceInitialAction] = useState<"sell" | null>(null);
  const [marketplaceInitialProductId, setMarketplaceInitialProductId] = useState<string | null>(null);
  const [showSafetySecurity, setShowSafetySecurity]         = useState(false);
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
  const [showCorporateLedger, setShowCorporateLedger]       = useState(false);
  const [corporateLedgerCategory, setCorporateLedgerCategory] = useState<"account" | "solutions" | "loan">("account");
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
  const [showLegal, setShowLegal]                           = useState(false);
  const [legalTab, setLegalTab]                             = useState<string | undefined>(undefined);
  const [contactTab, setContactTab]                          = useState<"connect" | "locate" | "feedback">("connect");
  const [showSwitchToVINK, setShowSwitchToVINK]               = useState(false);
  const [showBranchLocator, setShowBranchLocator]              = useState(false);
  const [showSponsorship, setShowSponsorship]                  = useState(false);
  const [showWEF, setShowWEF]                                  = useState(false);
  const [showBankingFees, setShowBankingFees]                  = useState(false);
  const [showBankingGuide, setShowBankingGuide]                = useState(false);
  const [showBankingChannels, setShowBankingChannels]          = useState(false);
  const [showExchangeRates, setShowExchangeRates]              = useState(false);
  const [showLatestOffers, setShowLatestOffers]                = useState(false);
  const [showMarketIndices, setShowMarketIndices]              = useState(false);
  const [showVinkBlog, setShowVinkBlog]                        = useState(false);
  const [show500App, setShow500App]                         = useState(false);
  const [showJobApp, setShowJobApp]                         = useState(false);
  const [showNewsManagement, setShowNewsManagement]         = useState(false);

  // ── Login state ───────────────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn]                         = useState(false);
  const [showManagementHub, setShowManagementHub]           = useState(false);
  const [showTaxiAssociations, setShowTaxiAssociations]     = useState(false);
  const [userRole, setUserRole]                             = useState<string>("personal");
  const [showLogin, setShowLogin]                           = useState(false);

  // ── Health check ──────────────────────────────────────────────────────────
  useEffect(() => { checkHealth().catch(() => {}); startHealthRecoveryWatch(); }, []);

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
      else if (id === "managementPanel")   { mount("managementPanel");  setShowManagementPanel(true); }
      else if (id === "vehicle")           { mount("vehicle");          setShowVehicle(true); }
      else if (id === "marketplace")       { mount("marketplaceLanding"); setShowMarketplaceLanding(true); pushRoute("/marketplace"); }
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
        case "managementPanel": mount("managementPanel"); setShowManagementPanel(true); break;
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
        case "marketplace":  mount("marketplaceLanding"); setShowMarketplaceLanding(true); pushRoute("/marketplace"); break;
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

  const CORP_PATH: Record<string, string> = {
    "Account": "/corporate/account", "Solutions & Credit Cards": "/corporate/solutions-credit-cards",
    "Loan": "/corporate/loan", "API": "/corporate/api", "Events": "/corporate/events",
    "Social Responsibility": "/corporate/social-responsibility",
  };
  const navigateCorporateItem = (item: string) => {
    if (CORP_PATH[item]) pushRoute(CORP_PATH[item]);
    setShowCorporateLedger(false);
    setShowCorporateApi(false);
    setShowCorporateEvents(false);
    setShowCorporateCSR(false);
    if (item === "Account")                  { mount("corpLedger"); setCorporateLedgerCategory("account");   setShowCorporateLedger(true); return; }
    if (item === "Solutions & Credit Cards")  { mount("corpLedger"); setCorporateLedgerCategory("solutions"); setShowCorporateLedger(true); return; }
    if (item === "Loan")                      { mount("corpLedger"); setCorporateLedgerCategory("loan");      setShowCorporateLedger(true); return; }
    if (item === "API")                       { mount("corpApi");       setShowCorporateApi(true); return; }
    if (item === "Events")                    { mount("corpEvents");    setShowCorporateEvents(true); return; }
    if (item === "Social Responsibility")     { mount("corpCSR");       setShowCorporateCSR(true); return; }
  };

  const BIZ_PATH: Record<string, string> = {
    "Start My Business": "/business/start-my-business", "Accounts": "/business/accounts",
    "Credit Cards": "/business/credit-cards", "Loans": "/business/loans",
    "Invest": "/business/invest", "Insure": "/business/insure",
    "Manage My Business": "/business/manage-my-business", "International": "/business/international",
    "Studio": "/business/studio", "News": "/business/news",
  };
  const navigateBusinessItem = (item: string) => {
    if (BIZ_PATH[item]) pushRoute(BIZ_PATH[item]);
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

  const pushRoute = (path: string) => {
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
  };

  const NAV_PATH: Record<string, string> = {
    "PersonalHome": "/personal",
    "Account": "/personal/account", "Credit Card": "/personal/credit-card", "Loan": "/personal/loan",
    "Invest": "/personal/invest", "Insure": "/personal/insure", "Rewards": "/personal/rewards",
    "Start My Business": "/business/start-my-business", "Accounts": "/business/accounts",
    "Credit Cards": "/business/credit-cards", "Loans": "/business/loans",
    "Business:Invest": "/business/invest", "Business:Insure": "/business/insure",
    "Manage My Business": "/business/manage-my-business", "International": "/business/international",
    "Studio": "/business/studio", "News": "/business/news",
    "Corporate:Account": "/corporate/account", "Corporate:Solutions & Credit Cards": "/corporate/solutions-credit-cards",
    "Corporate:Loan": "/corporate/loan", "Corporate:API": "/corporate/api", "Corporate:Events": "/corporate/events",
    "Corporate:Social Responsibility": "/corporate/social-responsibility",
    "Marketplace": "/marketplace",
    "Contact Us": "/contact-us",
  };

  const handleSubNavClick = (item: string) => {
    if (NAV_PATH[item]) pushRoute(NAV_PATH[item]);
    startTransition(() => {
      if (item === "Business:Insure")   { mount("bizLedger");          setBusinessLedgerCategory("insure"); setShowBusinessLedger(true); return; }
      if (item === "Business:Invest")   { mount("bizLedger");          setBusinessLedgerCategory("invest"); setShowBusinessLedger(true); return; }
      // Personal — top-level nav click opens the landing page; subnav items go through product selector
      if (item === "PersonalHome")      { mount("personalLanding"); setShowPersonalLanding(true); return; }
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
      if (item === "Corporate:Account")                  { mount("corpLedger"); setCorporateLedgerCategory("account");   setShowCorporateLedger(true); return; }
      if (item === "Corporate:Solutions & Credit Cards")  { mount("corpLedger"); setCorporateLedgerCategory("solutions"); setShowCorporateLedger(true); return; }
      if (item === "Corporate:Loan")                      { mount("corpLedger"); setCorporateLedgerCategory("loan");      setShowCorporateLedger(true); return; }
      if (item === "Corporate:API")                       { mount("corpApi");       setShowCorporateApi(true); return; }
      if (item === "Corporate:Events")                    { mount("corpEvents");    setShowCorporateEvents(true); return; }
      if (item === "Corporate:Social Responsibility")     { mount("corpCSR");       setShowCorporateCSR(true); return; }
      // Marketplace
      if (item === "Marketplace")       { mount("marketplaceLanding"); setShowMarketplaceLanding(true); return; }
    });
  };

  const closeAllRoutedViewers = () => {
    setShowPersonalLanding(false);
    setShowPersonalAccount(false); setShowPersonalLedger(false);
    setShowCreditCard(false); setShowCreditCardApp(false); setShowLoan(false); setShowInvest(false);
    setShowInsure(false); setShowRewards(false); setShowInvestApp(false); setShowInsureApp(false);
    setShowRewardsApp(false); setShowSIMServiceApp(false); setShowAccountApp(false); setShowClubBooking(false);
    setSelectorOpen(false);
    setShowStartBusiness(false); setShowBusinessAccountSelector(false); setShowBusinessAccounts(false);
    setShowBusinessLedger(false); setShowManageBusiness(false); setShowBusinessInternational(false);
    setShowBusinessStudio(false); setShowBusinessNews(false);
    setShowCorporateLedger(false); setShowCorporateApi(false); setShowCorporateEvents(false); setShowCorporateCSR(false);
    setShowMarketplace(false); setShowMarketplaceLanding(false);
    setShowContactUs(false); setShowAboutVINK(false); setShowCareers(false); setShowNews(false);
    setShowSwitchToVINK(false); setShowSafetySecurity(false); setShowInvestorRelations(false);
    setShowTaxiAssociations(false); setShow500App(false);
  };

  // ── Persistent top nav (Personal/Business/Corporate/Marketplace) ─────────
  // Shown above every full-screen site page so switching sections never
  // requires backing out to the homepage first.
  const activeSiteSection: "Personal" | "Business" | "Corporate" | "Marketplace" | null =
    (showPersonalLanding || showPersonalAccount || showPersonalLedger || showCreditCard || showCreditCardApp ||
     showLoan || showInvest || showInsure || showRewards || showInvestApp || showInsureApp || showRewardsApp ||
     showSIMServiceApp || showAccountApp || showClubBooking) ? "Personal" :
    (showStartBusiness || showBusinessAccountSelector || showBusinessAccounts || showBusinessLedger ||
     showBusinessLoanApp || showManageBusiness || showBusinessInternational || showBusinessStudio || showBusinessNews)
      ? "Business" :
    (showCorporateLedger || showCorporateLoanApp || showCorporateApi || showCorporateEvents || showCorporateCSR ||
     showInvestorRelations) ? "Corporate" :
    showMarketplace ? "Marketplace" :
    null;

  const showPersistentNav =
    activeSiteSection !== null || selectorOpen || showContactUs || showAboutVINK || showCareers || showNews ||
    showSwitchToVINK || showSafetySecurity || showTaxiAssociations || show500App || showJobApp;

  const goToSection = (section: "Personal" | "Business" | "Corporate" | "Marketplace") => {
    startTransition(() => {
      closeAllRoutedViewers();
      if (section === "Personal")    { mount("personalLanding");     setShowPersonalLanding(true);     pushRoute("/personal"); }
      if (section === "Business")    { mount("bizAccountSelector");  setShowBusinessAccountSelector(true); pushRoute("/business/accounts"); }
      if (section === "Corporate")   { mount("corpLedger"); setCorporateLedgerCategory("account"); setShowCorporateLedger(true); pushRoute("/corporate/account"); }
      if (section === "Marketplace") { mount("marketplaceLanding"); setShowMarketplaceLanding(true); pushRoute("/marketplace"); }
    });
  };

  const goHome = () => {
    startTransition(() => { closeAllRoutedViewers(); pushRoute("/"); });
  };

  const openRoute = (path: string): boolean => {
    const seg = path.replace(/^\/|\/$/g, "").split("/");
    if (seg[0] === "personal" && !seg[1]) {
      mount("personalLanding");
      setShowPersonalLanding(true);
      return true;
    }
    if (seg[0] === "personal" && seg[1]) {
      const map: Record<string, string> = { account: "account", "credit-card": "creditCard", loan: "loan", invest: "invest", insure: "insure", rewards: "rewards" };
      const cat = map[seg[1]];
      if (!cat) return false;
      mount("personalAccount");
      if (cat === "account") { setShowPersonalAccount(true); } else { mount("personalLedger"); setLedgerCategory(cat as any); setShowPersonalLedger(true); }
      return true;
    }
    if (seg[0] === "business" && seg[1]) {
      const map: Record<string, string> = {
        "start-my-business": "startBusiness", "accounts": "bizAccountSelector", "credit-cards": "bizLedger:creditCard",
        "loans": "bizLedger:loan", "invest": "bizLedger:invest", "insure": "bizLedger:insure",
        "manage-my-business": "manageBusiness", "international": "bizInternational", "studio": "bizStudio", "news": "bizNews",
      };
      const key = map[seg[1]];
      if (!key) return false;
      if (key.startsWith("bizLedger:")) { mount("bizLedger"); setBusinessLedgerCategory(key.split(":")[1] as any); setShowBusinessLedger(true); }
      else if (key === "startBusiness")      { mount("startBusiness"); setShowStartBusiness(true); }
      else if (key === "bizAccountSelector") { mount("bizAccountSelector"); setShowBusinessAccountSelector(true); }
      else if (key === "manageBusiness")     { mount("manageBusiness"); setShowManageBusiness(true); }
      else if (key === "bizInternational")   { mount("bizInternational"); setShowBusinessInternational(true); }
      else if (key === "bizStudio")          { mount("bizStudio"); setShowBusinessStudio(true); }
      else if (key === "bizNews")            { mount("bizNews"); setShowBusinessNews(true); }
      return true;
    }
    if (seg[0] === "corporate" && seg[1]) {
      const map: Record<string, string> = {
        "account": "corpLedger:account", "solutions-credit-cards": "corpLedger:solutions", "loan": "corpLedger:loan",
        "api": "corpApi", "events": "corpEvents", "social-responsibility": "corpCSR",
      };
      const key = map[seg[1]];
      if (!key) return false;
      if (key.startsWith("corpLedger:")) { mount("corpLedger"); setCorporateLedgerCategory(key.split(":")[1] as any); setShowCorporateLedger(true); }
      else if (key === "corpApi")    { mount("corpApi"); setShowCorporateApi(true); }
      else if (key === "corpEvents") { mount("corpEvents"); setShowCorporateEvents(true); }
      else if (key === "corpCSR")    { mount("corpCSR"); setShowCorporateCSR(true); }
      return true;
    }
    if (path === "/contact-us") { mount("contactUs"); setShowContactUs(true); return true; }
    if (path === "/marketplace") { mount("marketplaceLanding"); setShowMarketplaceLanding(true); return true; }
    return false;
  };

  // Deep-link support: open the right view if the page loads on a route
  // like /personal/account, and support the browser back/forward buttons.
  useEffect(() => {
    openRoute(window.location.pathname);
    const onPopState = () => {
      closeAllRoutedViewers();
      openRoute(window.location.pathname);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (label === "Contact Us")                                { setContactTab("connect"); open("contactUs", () => setShowContactUs(true)); }
      if (label === "Send your feedback")                        { setContactTab("feedback"); open("contactUs", () => setShowContactUs(true)); }
      if (label === "Switch to VINK")                             open("switchToVINK",        () => setShowSwitchToVINK(true));
      if (label === "Business debit order switching")            open("switchToVINK",        () => setShowSwitchToVINK(true));
      if (label === "Job Application")                            open("jobapp",             () => setShowJobApp(true));
      if (label === "Browse Apps")                               startTransition(() => { mount("appLauncher"); setShowAppLauncher(true); });
      if (label === "Get Help & Information")                    { setContactTab("connect"); open("contactUs", () => setShowContactUs(true)); }
      if (label === "Message Us")                                { setContactTab("connect"); open("contactUs", () => setShowContactUs(true)); }
      if (label === "Legal and Compliance")                      { setLegalTab("compliance"); open("legal", () => setShowLegal(true)); }
      if (label === "Terms of use" || label === "Terms Of Use")  { setLegalTab("terms");      open("legal", () => setShowLegal(true)); }
      if (label === "Banking regulations" || label === "Banking Regulations") { setLegalTab("regulatory"); open("legal", () => setShowLegal(true)); }
      if (label === "Privacy Statement")                         { setLegalTab("privacy");    open("legal", () => setShowLegal(true)); }
      if (label === "Security Centre")                           { setLegalTab("privacy");    open("legal", () => setShowLegal(true)); }
      // Previously dead links -- each of these already has a real,
      // built destination elsewhere in the app that just wasn't wired
      // to the footer yet.
      if (label === "Safety and Security")                       { mount("safetySecurity"); setShowSafetySecurity(true); }
      if (label === "Personal Banking")                          goToSection("Personal");
      if (label === "Business Banking")                          goToSection("Business");
      if (label === "Corporate and Investment Banking")          goToSection("Corporate");
      if (label === "Wealth and Investment Management")          { mount("invest"); setShowInvest(true); }
      if (label === "Social Responsibility")                     { mount("corpCSR"); setShowCorporateCSR(true); }
      if (label === "Find the Branch")                           { mount("branchLocator"); setShowBranchLocator(true); }
      if (label === "Sponsorship")                               { mount("sponsorship"); setShowSponsorship(true); }
      if (label === "VINK at the World Economic Forum")          { mount("wef"); setShowWEF(true); }
      if (label === "Banking rates and fees")                    { mount("bankingFees"); setShowBankingFees(true); }
      if (label === "Guide to help you bank")                    { mount("bankingGuide"); setShowBankingGuide(true); }
      if (label === "App, Online and other banking")             { mount("bankingChannels"); setShowBankingChannels(true); }
      if (label === "Exchange rates")                            { mount("exchangeRates"); setShowExchangeRates(true); }
      if (label === "Latest Offers")                             { mount("latestOffers"); setShowLatestOffers(true); }
      if (label === "Market Indices")                            { mount("marketIndices"); setShowMarketIndices(true); }
      if (label === "VINK blog")                                 { mount("vinkBlog"); setShowVinkBlog(true); }
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
    <div className={`min-h-screen bg-transparent${showPersistentNav ? " has-persistent-nav" : ""}`}>
      <Toaster position="top-right" richColors closeButton duration={4000} />

      {showPersistentNav && (
        <PersistentTopNav active={activeSiteSection} onSelect={goToSection} onHome={goHome} />
      )}

      {/* ── Homepage ────────────────────────────────────────────────────────── */}
      <ErrorBoundary>
        <Header
          onDashboardSelect={(id) => {
            setIsLoggedIn(true);
            setUserRole(getSession()?.name ?? id);
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

      <LazySection><Suspense fallback={null}><FeaturesSection onExploreAll={() => { mount("appLauncher"); setShowAppLauncher(true); }} /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><ProtectionSection /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><CreditCardsSection onApply={() => openSelector("creditCard")} /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><BusinessPowerSection onSubNavClick={handleSubNavClick} /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><PreApprovalSection onApply={() => openSelector("loan")} /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><FeaturedOffersSection onCompareCards={() => openSelector("creditCard")} /></Suspense></LazySection>
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
      {has("managementPanel") && <Suspense fallback={null}><ManagementPanelViewer  isOpen={showManagementPanel} onClose={() => setShowManagementPanel(false)} adminName={getSession()?.name} adminRole={getSession()?.role === "superadmin" ? "Super Administrator" : getSession()?.role === "owner" ? "System Owner" : getSession()?.role} role={getSession()?.role} onOpenNewsManagement={() => { mount("newsManagement"); setShowNewsManagement(true); }} /></Suspense>}
      {has("newsManagement")   && <Suspense fallback={null}><NewsManagementDashboard isOpen={showNewsManagement} onClose={() => setShowNewsManagement(false)} /></Suspense>}
      {has("vehicle")         && <Suspense fallback={null}><VehicleTrackingDashboard isOpen={showVehicle}       onClose={() => setShowVehicle(false)} /></Suspense>}
      {has("marketplaceLanding") && <Suspense fallback={null}><MarketplaceLandingViewer isOpen={showMarketplaceLanding} onClose={() => { setShowMarketplaceLanding(false); pushRoute("/"); }} onShop={(productId) => { setMarketplaceInitialAction(null); setMarketplaceInitialProductId(productId ?? null); setShowMarketplaceLanding(false); mount("marketplace"); setShowMarketplace(true); }} onSell={() => { setMarketplaceInitialAction("sell"); setMarketplaceInitialProductId(null); setShowMarketplaceLanding(false); mount("marketplace"); setShowMarketplace(true); }} /></Suspense>}
      {has("marketplace")     && <Suspense fallback={null}><VinkMarketplace        isOpen={showMarketplace}     onClose={() => { setShowMarketplace(false); pushRoute("/"); }} initialAction={marketplaceInitialAction} initialProductId={marketplaceInitialProductId} onOpenManagementPanel={() => { mount("managementPanel"); setShowManagementPanel(true); }} /></Suspense>}

      {/* Personal products */}
      {has("personalLanding") && <Suspense fallback={null}><PersonalLandingViewer isOpen={showPersonalLanding} onClose={() => { setShowPersonalLanding(false); pushRoute("/"); }} onNavigate={(item) => { setShowPersonalLanding(false); handleSubNavClick(item); }} onApplyClick={() => { setShowPersonalLanding(false); handleSubNavClick("Account"); }} onSecurityClick={() => { mount("safetySecurity"); setShowSafetySecurity(true); }} /></Suspense>}
      {has("safetySecurity")  && <Suspense fallback={null}><SafetySecurityViewer  isOpen={showSafetySecurity} onClose={() => setShowSafetySecurity(false)} /></Suspense>}
      {has("personalAccount") && <Suspense fallback={null}><PersonalAccountViewer  isOpen={showPersonalAccount} onClose={() => { setShowPersonalAccount(false); pushRoute("/"); }} onNavigate={(cat) => { setShowPersonalAccount(false); setLedgerCategory(cat); setShowPersonalLedger(true); pushRoute(`/personal/${cat === "creditCard" ? "credit-card" : cat}`); }} /></Suspense>}
      {has("personalLedger")  && <Suspense fallback={null}><PersonalProductLedgerViewer isOpen={showPersonalLedger} onClose={() => { setShowPersonalLedger(false); pushRoute("/"); }} initialCategory={ledgerCategory} onNavigateToAccount={() => { setShowPersonalLedger(false); setShowPersonalAccount(true); pushRoute("/personal/account"); }} onApply={applyForProductCategory} /></Suspense>}
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
      {has("startBusiness")      && <Suspense fallback={null}><StartMyBusinessViewer       isOpen={showStartBusiness}       onClose={() => { setShowStartBusiness(false); pushRoute("/"); }} onNavigate={navigateBusinessItem} /></Suspense>}
      {has("bizAccountSelector") && <Suspense fallback={null}><BusinessAccountSelectorViewer isOpen={showBusinessAccountSelector} onClose={() => { setShowBusinessAccountSelector(false); pushRoute("/"); }} onNavigate={(item) => navigateBusinessItem(item)} onApply={(type) => { setShowBusinessAccountSelector(false); mount("bizAccounts"); setChosenBusinessAccountType(type); setShowBusinessAccounts(true); }} onOpenApp={() => { mount("vinkBusinessBankingApp"); setShowVinkBusinessBankingApp(true); }} /></Suspense>}
      {has("bizAccounts")        && <Suspense fallback={null}><BusinessAccountApplicationViewer isOpen={showBusinessAccounts} onClose={() => { setShowBusinessAccounts(false); pushRoute("/"); }} initialAccountType={chosenBusinessAccountType} /></Suspense>}
      {has("bizLedger") && <Suspense fallback={null}><BusinessProductLedgerViewer isOpen={showBusinessLedger} onClose={() => { setShowBusinessLedger(false); pushRoute("/"); }} initialCategory={businessLedgerCategory} onNavigate={(item) => navigateBusinessItem(item)} onApply={applyForProductCategory} /></Suspense>}
      {has("bizLoanApp")         && <Suspense fallback={null}><BusinessLoanApplicationViewer isOpen={showBusinessLoanApp}   onClose={() => setShowBusinessLoanApp(false)} /></Suspense>}
      {has("manageBusiness")     && <Suspense fallback={null}><ManageMyBusinessViewer      isOpen={showManageBusiness}      onClose={() => { setShowManageBusiness(false); pushRoute("/"); }} onNavigate={navigateBusinessItem} /></Suspense>}
      {has("bizInternational")   && <Suspense fallback={null}><BusinessInternationalViewer isOpen={showBusinessInternational} onClose={() => { setShowBusinessInternational(false); pushRoute("/"); }} onNavigate={navigateBusinessItem} /></Suspense>}
      {has("bizStudio")          && <Suspense fallback={null}><BusinessStudioViewer        isOpen={showBusinessStudio}      onClose={() => { setShowBusinessStudio(false); pushRoute("/"); }} onNavigate={navigateBusinessItem} /></Suspense>}
      {has("bizNews")            && <Suspense fallback={null}><BusinessNewsViewer          isOpen={showBusinessNews}        onClose={() => { setShowBusinessNews(false); pushRoute("/"); }} onNavigate={navigateBusinessItem} /></Suspense>}

      {/* Corporate */}
      {has("corpLedger")         && <Suspense fallback={null}><CorporateProductLedgerViewer isOpen={showCorporateLedger} onClose={() => { setShowCorporateLedger(false); pushRoute("/"); }} initialCategory={corporateLedgerCategory} onNavigate={(item) => navigateCorporateItem(item)} onOpenApp={() => { mount("vinkCorporateBankingApp"); setShowVinkCorporateBankingApp(true); }} /></Suspense>}
      {has("corpLoanApp")        && <Suspense fallback={null}><CorporateLoanApplicationViewer isOpen={showCorporateLoanApp} onClose={() => setShowCorporateLoanApp(false)} /></Suspense>}
      {has("corpApi")            && <Suspense fallback={null}><CorporateApiViewer          isOpen={showCorporateApi}        onClose={() => { setShowCorporateApi(false); pushRoute("/"); }} onNavigate={(item) => navigateCorporateItem(item)} /></Suspense>}
      {has("corpEvents")         && <Suspense fallback={null}><CorporateEventsViewer       isOpen={showCorporateEvents}     onClose={() => { setShowCorporateEvents(false); pushRoute("/"); }} onNavigate={(item) => navigateCorporateItem(item)} /></Suspense>}
      {has("corpCSR")            && <Suspense fallback={null}><CorporateSocialResponsibilityViewer isOpen={showCorporateCSR} onClose={() => { setShowCorporateCSR(false); pushRoute("/"); }} onNavigate={(item) => navigateCorporateItem(item)} /></Suspense>}

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
      {has("vinkBankingApp")     && <Suspense fallback={null}><VinkBankingApp        isOpen={showVinkBankingApp}     onClose={() => setShowVinkBankingApp(false)} onOpenManagementPanel={() => { mount("managementPanel"); setShowManagementPanel(true); }} /></Suspense>}
      {has("vinkBusinessBankingApp") && <Suspense fallback={null}><VinkBusinessBankingApp isOpen={showVinkBusinessBankingApp} onClose={() => setShowVinkBusinessBankingApp(false)} /></Suspense>}
      {has("vinkCorporateBankingApp") && <Suspense fallback={null}><VinkCorporateBankingApp isOpen={showVinkCorporateBankingApp} onClose={() => setShowVinkCorporateBankingApp(false)} /></Suspense>}
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
      {has("contactUs")          && <Suspense fallback={null}><ContactUsViewer            isOpen={showContactUs}  onClose={() => { setShowContactUs(false); pushRoute("/"); }} initialTab={contactTab} /></Suspense>}
      {has("legal")              && <Suspense fallback={null}><LegalComplianceViewer      isOpen={showLegal}      onClose={() => setShowLegal(false)} initialTab={legalTab} /></Suspense>}
      {has("switchToVINK")        && <Suspense fallback={null}><SwitchToVINKViewer          isOpen={showSwitchToVINK} onClose={() => setShowSwitchToVINK(false)} /></Suspense>}
      {has("branchLocator")       && <Suspense fallback={null}><BranchLocatorViewer         isOpen={showBranchLocator} onClose={() => setShowBranchLocator(false)} /></Suspense>}
      {has("sponsorship")         && <Suspense fallback={null}><SponsorshipViewer           isOpen={showSponsorship} onClose={() => setShowSponsorship(false)} /></Suspense>}
      {has("wef")                 && <Suspense fallback={null}><WEFViewer                   isOpen={showWEF} onClose={() => setShowWEF(false)} /></Suspense>}
      {has("bankingFees")         && <Suspense fallback={null}><BankingFeesViewer           isOpen={showBankingFees} onClose={() => setShowBankingFees(false)} /></Suspense>}
      {has("bankingGuide")        && <Suspense fallback={null}><BankingGuideViewer          isOpen={showBankingGuide} onClose={() => setShowBankingGuide(false)} /></Suspense>}
      {has("bankingChannels")     && <Suspense fallback={null}><BankingChannelsViewer       isOpen={showBankingChannels} onClose={() => setShowBankingChannels(false)} /></Suspense>}
      {has("exchangeRates")       && <Suspense fallback={null}><ExchangeRatesViewer         isOpen={showExchangeRates} onClose={() => setShowExchangeRates(false)} /></Suspense>}
      {has("latestOffers")        && <Suspense fallback={null}><LatestOffersViewer          isOpen={showLatestOffers} onClose={() => setShowLatestOffers(false)} /></Suspense>}
      {has("marketIndices")       && <Suspense fallback={null}><MarketIndicesViewer         isOpen={showMarketIndices} onClose={() => setShowMarketIndices(false)} /></Suspense>}
      {has("vinkBlog")            && <Suspense fallback={null}><VinkBlogViewer              isOpen={showVinkBlog} onClose={() => setShowVinkBlog(false)} /></Suspense>}
      {has("managementHub")      && <Suspense fallback={null}><ManagementHub              isOpen={showManagementHub}       onClose={() => setShowManagementHub(false)} /></Suspense>}
      {has("taxiAssociations")   && <Suspense fallback={null}><TaxiAssociationsViewer       isOpen={showTaxiAssociations} onClose={() => setShowTaxiAssociations(false)} /></Suspense>}
      {has("500app")             && <Suspense fallback={null}><FiveHundredGlobalApplication isOpen={show500App}          onClose={() => setShow500App(false)} /></Suspense>}
      {has("jobapp")             && <Suspense fallback={null}><JobApplicationViewer         isOpen={showJobApp}          onClose={() => setShowJobApp(false)} /></Suspense>}
    </div>
  );
}
