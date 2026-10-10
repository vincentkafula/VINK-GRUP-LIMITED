import { PORTALS, type PortalKey } from "./components/portal/portalDefs";
import { useState, lazy, Suspense, startTransition, useEffect, useCallback } from "react";
import { Toaster } from "sonner";
import { useTheme, useOverlayA11y } from "./components/ds";
import { checkHealth, getSession, startHealthRecoveryWatch } from "./services/apiClient";
import { setPageMeta, PAGE_META } from "./services/seo";
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
const AppShowcaseSection           = lazy(() => import("./components/AppShowcaseSection").then(m => ({ default: m.AppShowcaseSection })));
const Footer                       = lazy(() => import("./components/Footer").then(m => ({ default: m.Footer })));

// ─── Overlays ─────────────────────────────────────────────────────────────────
const PostLoginHome               = lazy(() => import("./components/PostLoginHome").then(m => ({ default: m.PostLoginHome })));
const UserProfileViewer           = lazy(() => import("./components/UserProfileViewer").then(m => ({ default: m.UserProfileViewer })));
const OwnersDashboard             = lazy(() => import("./components/dashboards/OwnersDashboard").then(m => ({ default: m.OwnersDashboard })));
const InvestorsDashboard          = lazy(() => import("./components/dashboards/InvestorsDashboard").then(m => ({ default: m.InvestorsDashboard })));
const SuperAdminDashboard         = lazy(() => import("./components/dashboards/SuperAdminDashboard").then(m => ({ default: m.SuperAdminDashboard })));
const BankingDashboard            = lazy(() => import("./components/BankingDashboard").then(m => ({ default: m.BankingDashboard })));
const DriveDashboardViewer        = lazy(() => import("./components/DriveDashboardViewer").then(m => ({ default: m.DriveDashboardViewer })));
const OwnerFleetDashboardViewer   = lazy(() => import("./components/OwnerFleetDashboardViewer").then(m => ({ default: m.OwnerFleetDashboardViewer })));
const TaxiAssociationDashboardViewer = lazy(() => import("./components/TaxiAssociationDashboardViewer").then(m => ({ default: m.TaxiAssociationDashboardViewer })));
const TerminalManagementViewer = lazy(() => import("./components/TerminalManagementViewer").then(m => ({ default: m.TerminalManagementViewer })));
const ControlCentreViewer = lazy(() => import("./components/ControlCentreViewer").then(m => ({ default: m.ControlCentreViewer })));
const InvestorFleetDashboardViewer = lazy(() => import("./components/InvestorFleetDashboardViewer").then(m => ({ default: m.InvestorFleetDashboardViewer })));
const TokenReader                 = lazy(() => import("./components/TokenReader").then(m => ({ default: m.TokenReader })));
const ManagementPanelViewer       = lazy(() => import("./components/ManagementPanelViewer").then(m => ({ default: m.ManagementPanelViewer })));
import { PersistentTopNav } from "./components/PersistentTopNav";
import { siteChrome } from "./sitePages";
import { markPageBars } from "./pageBars";
const PersonalAccountViewer       = lazy(() => import("./components/PersonalAccountViewer").then(m => ({ default: m.PersonalAccountViewer })));
const PersonalLandingViewer       = lazy(() => import("./components/PersonalLandingViewer").then(m => ({ default: m.PersonalLandingViewer })));
const BusinessLandingViewer       = lazy(() => import("./components/BusinessLandingViewer").then(m => ({ default: m.BusinessLandingViewer })));
const SafetySecurityViewer        = lazy(() => import("./components/footerPages/SafetySecurityViewer").then(m => ({ default: m.SafetySecurityViewer })));
const PersonalProductLedgerViewer = lazy(() => import("./components/PersonalProductLedgerViewer").then(m => ({ default: m.PersonalProductLedgerViewer })));
const CreditCardViewer            = lazy(() => import("./components/CreditCardViewer").then(m => ({ default: m.CreditCardViewer })));
const CreditCardApplicationViewer = lazy(() => import("./components/CreditCardApplicationViewer").then(m => ({ default: m.CreditCardApplicationViewer })));
const LoanViewer                  = lazy(() => import("./components/LoanViewer").then(m => ({ default: m.LoanViewer })));
const InvestViewer                = lazy(() => import("./components/InvestViewer").then(m => ({ default: m.InvestViewer })));
const RewardsViewer               = lazy(() => import("./components/RewardsViewer").then(m => ({ default: m.RewardsViewer })));
const ServiceApplicationViewer    = lazy(() => import("./components/ServiceApplicationViewer").then(m => ({ default: m.ServiceApplicationViewer })));
const ProductSelectorViewer       = lazy(() => import("./components/ProductSelectorViewer").then(m => ({ default: m.ProductSelectorViewer })));
const StartMyBusinessViewer       = lazy(() => import("./components/StartMyBusinessViewer").then(m => ({ default: m.StartMyBusinessViewer })));
const BusinessProductLedgerViewer = lazy(() => import("./components/BusinessProductLedgerViewer").then(m => ({ default: m.BusinessProductLedgerViewer })));
const BusinessAccountApplicationViewer = lazy(() => import("./components/BusinessAccountApplicationViewer").then(m => ({ default: m.BusinessAccountApplicationViewer })));
const BusinessAccountSelectorViewer = lazy(() => import("./components/BusinessAccountSelectorViewer").then(m => ({ default: m.BusinessAccountSelectorViewer })));
const BusinessLoanApplicationViewer = lazy(() => import("./components/BusinessLoanApplicationViewer").then(m => ({ default: m.BusinessLoanApplicationViewer })));
const ManageMyBusinessViewer      = lazy(() => import("./components/ManageMyBusinessViewer").then(m => ({ default: m.ManageMyBusinessViewer })));
const CorporateProductLedgerViewer = lazy(() => import("./components/CorporateProductLedgerViewer").then(m => ({ default: m.CorporateProductLedgerViewer })));
const CorporateLoanApplicationViewer = lazy(() => import("./components/CorporateLoanApplicationViewer").then(m => ({ default: m.CorporateLoanApplicationViewer })));
const CorporateSocialResponsibilityViewer = lazy(() => import("./components/CorporateSocialResponsibilityViewer").then(m => ({ default: m.CorporateSocialResponsibilityViewer })));
const InvestorRelationsViewer     = lazy(() => import("./components/InvestorRelationsViewer").then(m => ({ default: m.InvestorRelationsViewer })));
const GlobalBankingDashboard      = lazy(() => import("./components/GlobalBankingDashboard").then(m => ({ default: m.GlobalBankingDashboard })));
const FinancialReportsViewer      = lazy(() => import("./components/FinancialReportsViewer").then(m => ({ default: m.FinancialReportsViewer })));
const AdminDashboard              = lazy(() => import("./components/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const CardNetworkDashboard        = lazy(() => import("./components/CardNetworkDashboard").then(m => ({ default: m.CardNetworkDashboard })));
const AFCManagementDashboard      = lazy(() => import("./components/AFCManagementDashboard").then(m => ({ default: m.AFCManagementDashboard })));
const AdminApplicationsViewer     = lazy(() => import("./components/AdminApplicationsViewer").then(m => ({ default: m.AdminApplicationsViewer })));
const RevenueDashboard            = lazy(() => import("./components/RevenueDashboard").then(m => ({ default: m.RevenueDashboard })));
const AFCApp                      = lazy(() => import("./components/apps/AFCApp").then(m => ({ default: m.AFCApp })));
const VinkBankingApp              = lazy(() => import("./components/apps/VinkBankingApp").then(m => ({ default: m.VinkBankingApp })));
const VinkBusinessBankingApp      = lazy(() => import("./components/apps/VinkBusinessBankingApp").then(m => ({ default: m.VinkBusinessBankingApp })));
const VinkCorporateBankingApp     = lazy(() => import("./components/apps/VinkCorporateBankingApp").then(m => ({ default: m.VinkCorporateBankingApp })));
const VinkMobileApp               = lazy(() => import("./components/apps/VinkMobileApp").then(m => ({ default: m.VinkMobileApp })));
const AppLauncher                 = lazy(() => import("./components/apps/AppLauncher").then(m => ({ default: m.AppLauncher })));
const AboutVINKViewer              = lazy(() => import("./components/footerPages/AboutVINKViewer").then(m => ({ default: m.AboutVINKViewer })));
const LegalComplianceViewer         = lazy(() => import("./components/footerPages/LegalComplianceViewer").then(m => ({ default: m.LegalComplianceViewer })));
const CareersViewer               = lazy(() => import("./components/footerPages/CareersViewer").then(m => ({ default: m.CareersViewer })));
const ContactUsViewer             = lazy(() => import("./components/footerPages/ContactUsViewer").then(m => ({ default: m.ContactUsViewer })));
const SwitchToVINKViewer           = lazy(() => import("./components/footerPages/SwitchToVINKViewer").then(m => ({ default: m.SwitchToVINKViewer })));
const BranchLocatorViewer          = lazy(() => import("./components/footerPages/BranchLocatorViewer").then(m => ({ default: m.BranchLocatorViewer })));
const SponsorshipViewer            = lazy(() => import("./components/footerPages/SponsorshipViewer").then(m => ({ default: m.SponsorshipViewer })));
const BankingFeesViewer            = lazy(() => import("./components/footerPages/BankingFeesViewer").then(m => ({ default: m.BankingFeesViewer })));
const BankingGuideViewer           = lazy(() => import("./components/footerPages/BankingGuideViewer").then(m => ({ default: m.BankingGuideViewer })));
const BankingChannelsViewer        = lazy(() => import("./components/footerPages/BankingChannelsViewer").then(m => ({ default: m.BankingChannelsViewer })));
const ExchangeRatesViewer          = lazy(() => import("./components/footerPages/ExchangeRatesViewer").then(m => ({ default: m.ExchangeRatesViewer })));
const LatestOffersViewer           = lazy(() => import("./components/footerPages/LatestOffersViewer").then(m => ({ default: m.LatestOffersViewer })));
const MarketIndicesViewer          = lazy(() => import("./components/footerPages/MarketIndicesViewer").then(m => ({ default: m.MarketIndicesViewer })));
const VinkBlogViewer               = lazy(() => import("./components/footerPages/VinkBlogViewer").then(m => ({ default: m.VinkBlogViewer })));
const JobApplicationViewer = lazy(() => import("./components/JobApplicationViewer").then(m => ({ default: m.JobApplicationViewer })));
const TaxiAssociationsViewer       = lazy(() => import("./components/TaxiAssociationsViewer").then(m => ({ default: m.TaxiAssociationsViewer })));
const RolePortal                   = lazy(() => import("./components/portal/RolePortal").then(m => ({ default: m.RolePortal })));
const AdminConfig                   = lazy(() => import("./components/portal/AdminConfig").then(m => ({ default: m.AdminConfig })));
const AdminBankLinks                = lazy(() => import("./components/portal/AdminBankLinks").then(m => ({ default: m.AdminBankLinks })));
const AuthLinkPage                 = lazy(() => import("./components/AuthLinkPage").then(m => ({ default: m.AuthLinkPage })));
const ManshyaDashboard            = lazy(() => import("./components/manshya/ManshyaDashboard").then(m => ({ default: m.ManshyaDashboard })));
const ManshyaAdmin                = lazy(() => import("./components/manshya/ManshyaAdmin").then(m => ({ default: m.ManshyaAdmin })));
const ManshyaPay                  = lazy(() => import("./components/manshya/ManshyaPay").then(m => ({ default: m.ManshyaPay })));
const ManagementHub                = lazy(() => import("./components/ManagementHub").then(m => ({ default: m.ManagementHub })));

export default function App() {
  const theme = useTheme();
  useOverlayA11y();
  // ── Mounted set — overlays mount on first open, stay mounted ──────────────
  const [mounted, setMounted] = useState<Set<string>>(new Set());
  const mount = useCallback((key: string) => {
    setMounted(prev => { const n = new Set(prev); n.add(key); return n; });
  }, []);
  const has = (key: string) => mounted.has(key);

  // ── Overlay visibility states ──────────────────────────────────────────────
  const [showPostLogin, setShowPostLogin]                   = useState(false);
  const [showUserProfile, setShowUserProfile]                = useState(false);
  const [showOwners, setShowOwners]                         = useState(false);
  const [showInvestors, setShowInvestors]                   = useState(false);
  const [showSuperAdmin, setShowSuperAdmin]                 = useState(false);
  const [showBanking, setShowBanking]                       = useState(false);
  const [showDriveDashboard, setShowDriveDashboard]          = useState(false);
  const [showOwnerDashboard, setShowOwnerDashboard]          = useState(false);
  const [showTaxiAssociationDashboard, setShowTaxiAssociationDashboard] = useState(false);
  const [showTerminalManagement, setShowTerminalManagement] = useState(false);
  const [showControlCentre, setShowControlCentre] = useState(false);
  const [showInvestorDashboard, setShowInvestorDashboard] = useState(false);
  const [showManagementPanel, setShowManagementPanel]       = useState(false);
  const [showTokenReader, setShowTokenReader]                 = useState(false);
  const [showSIMApp, setShowSIMApp]                         = useState(false);

  // ── Super App Ecosystem ────────────────────────────────────────────────────
  const [showAFCApp, setShowAFCApp]                         = useState(false);
  const [showVinkBankingApp, setShowVinkBankingApp]         = useState(false);
  const [vinkBankingAppInitialScreen, setVinkBankingAppInitialScreen] = useState<"home" | "send" | "cards" | "history" | "rewards" | undefined>(undefined);
  const [showVinkBusinessBankingApp, setShowVinkBusinessBankingApp] = useState(false);
  const [showVinkCorporateBankingApp, setShowVinkCorporateBankingApp] = useState(false);
  const [showVinkMobileApp, setShowVinkMobileApp]           = useState(false);
  const [showAppLauncher, setShowAppLauncher]               = useState(false);
  const [showRevenueDashboard, setShowRevenueDashboard]     = useState(false);

  // ── Personal products ──────────────────────────────────────────────────────
  const [showPersonalLanding, setShowPersonalLanding]       = useState(false);
  const [showBusinessLanding, setShowBusinessLanding]       = useState(false);
  const [showSafetySecurity, setShowSafetySecurity]         = useState(false);
  const [showPersonalAccount, setShowPersonalAccount]       = useState(false);
  const [showPersonalLedger, setShowPersonalLedger]          = useState(false);
  const [ledgerCategory, setLedgerCategory]                  = useState<"creditCard" | "loan" | "invest" | "rewards">("creditCard");
  const [showCreditCard, setShowCreditCard]                 = useState(false);
  const [showCreditCardApp, setShowCreditCardApp]           = useState(false);
  const [showLoan, setShowLoan]                             = useState(false);
  const [showInvest, setShowInvest]                         = useState(false);
  const [showRewards, setShowRewards]                       = useState(false);
  const [showInvestApp, setShowInvestApp]                   = useState(false);
  const [showRewardsApp, setShowRewardsApp]                 = useState(false);
  const [showAccountApp, setShowAccountApp]                 = useState(false);

  // ── Product selector ───────────────────────────────────────────────────────
  const [selectorOpen, setSelectorOpen]                     = useState(false);
  const [selectorCategory, setSelectorCategory]             = useState<"account"|"creditCard"|"loan"|"invest"|"rewards"|null>(null);

  // ── Business ──────────────────────────────────────────────────────────────
  const [showStartBusiness, setShowStartBusiness]           = useState(false);
  const [showBusinessAccounts, setShowBusinessAccounts]     = useState(false);
  const [showBusinessAccountSelector, setShowBusinessAccountSelector] = useState(false);
  const [chosenBusinessAccountType, setChosenBusinessAccountType] = useState<string | undefined>(undefined);
  const [showBusinessLedger, setShowBusinessLedger]         = useState(false);
  const [businessLedgerCategory, setBusinessLedgerCategory] = useState<"creditCard" | "loan" | "invest">("creditCard");
  const [showBusinessLoanApp, setShowBusinessLoanApp]       = useState(false);
  const [showManageBusiness, setShowManageBusiness]         = useState(false);

  // ── Corporate ─────────────────────────────────────────────────────────────
  const [showCorporateLedger, setShowCorporateLedger]       = useState(false);
  const [corporateLedgerCategory, setCorporateLedgerCategory] = useState<"account" | "solutions" | "loan">("account");
  const [showCorporateLoanApp, setShowCorporateLoanApp]     = useState(false);
  const [showCorporateCSR, setShowCorporateCSR]             = useState(false);

  // ── Operations / Admin ────────────────────────────────────────────────────
  const [showGlobalBanking, setShowGlobalBanking]           = useState(false);
  const [showFinancialReports, setShowFinancialReports]     = useState(false);
  const [showAdminDashboard, setShowAdminDashboard]         = useState(false);
  const [showAFCDashboard, setShowAFCDashboard]             = useState(false);
  const [showAdminApps, setShowAdminApps]                   = useState(false);
  const [showCardNetwork, setShowCardNetwork]               = useState(false);
  const [showInvestorRelations, setShowInvestorRelations]   = useState(false);

  // ── Footer pages ──────────────────────────────────────────────────────────
  const [showAboutVINK, setShowAboutVINK]                     = useState(false);
  const [showCareers, setShowCareers]                       = useState(false);
  const [showContactUs, setShowContactUs]                   = useState(false);
  const [showLegal, setShowLegal]                           = useState(false);
  const [legalTab, setLegalTab]                             = useState<string | undefined>(undefined);
  const [contactTab, setContactTab]                          = useState<"connect" | "locate" | "feedback">("connect");
  const [showSwitchToVINK, setShowSwitchToVINK]               = useState(false);
  const [showBranchLocator, setShowBranchLocator]              = useState(false);
  const [showSponsorship, setShowSponsorship]                  = useState(false);
  const [showBankingFees, setShowBankingFees]                  = useState(false);
  const [showBankingGuide, setShowBankingGuide]                = useState(false);
  const [showBankingChannels, setShowBankingChannels]          = useState(false);
  const [showExchangeRates, setShowExchangeRates]              = useState(false);
  const [showLatestOffers, setShowLatestOffers]                = useState(false);
  const [showMarketIndices, setShowMarketIndices]              = useState(false);
  const [showVinkBlog, setShowVinkBlog]                        = useState(false);
  const [showJobApp, setShowJobApp]                         = useState(false);

  // ── Login state ───────────────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn]                         = useState(false);
  const [showManagementHub, setShowManagementHub]           = useState(false);
  const [showTaxiAssociations, setShowTaxiAssociations]     = useState(false);
  const [userRole, setUserRole]                             = useState<string>("personal");
  const [showLogin, setShowLogin]                           = useState(false);
  // VINK payments & banking: dashboard (customers), back office (staff), hosted checkout (public)
  // Emailed links: /reset-password?token=... and /verify-email?token=...
  const [authLink, setAuthLink]                               = useState<null | "reset" | "verify">(null);
  const [portal, setPortal]                                  = useState<null | PortalKey>(null);
  const [adminBank, setAdminBank]                             = useState(false);
  const [adminConfig, setAdminConfig]                         = useState(false);
  const [showManshya, setShowManshya]                        = useState(false);
  const [showManshyaAdmin, setShowManshyaAdmin]              = useState(false);
  const [showManshyaPay, setShowManshyaPay]                  = useState(false);

  // ── Health check ──────────────────────────────────────────────────────────
  useEffect(() => { checkHealth().catch(() => {}); startHealthRecoveryWatch(); }, []);

  // ── Body scroll lock ──────────────────────────────────────────────────────
  const anyOverlayOpen = mounted.size > 0 && Array.from(mounted).some(k => {
    const stateMap: Record<string, boolean> = {
      postLogin: showPostLogin,
      banking: showBanking,
      owners: showOwners, investors: showInvestors,
      superAdmin: showSuperAdmin,
      appLauncher: showAppLauncher, afcApp: showAFCApp,
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
      else if (id === "afc")               { mount("afcDashboard");     setShowAFCDashboard(true); }
      else if (id === "admin")             { mount("adminDashboard");   setShowAdminDashboard(true); }
      else if (id === "cardnetwork")       { mount("cardNetwork");      setShowCardNetwork(true); }
      else if (id === "owner")             { mount("owners");           setShowOwners(true); }
      else if (id === "investor")          { mount("investors");        setShowInvestors(true); }
      else if (id === "superadmin")        { mount("superAdmin");       setShowSuperAdmin(true); }
      else if (id === "devices")           { mount("afcDashboard");     setShowAFCDashboard(true); }
      else if (id === "finance")           { mount("financialReports"); setShowFinancialReports(true); }
      else if (id === "business")          { mount("banking");          setShowBanking(true); }
      else if (id === "account")           { mount("postLogin");        setShowPostLogin(true); }
      else if (id === "managementPanel")   { mount("managementPanel");  setShowManagementPanel(true); pushRoute("/management-panel"); }
      else if (id.startsWith("portal:") && id.slice(7) in PORTALS) { mount("portal"); setPortal(id.slice(7) as PortalKey); pushRoute("/portal/" + id.slice(7)); }
      else if (id === "manshya")           { mount("manshya");          setShowManshya(true); pushRoute("/manshya"); }
      else if (id === "manshyaAdmin")      { mount("manshyaAdmin");     setShowManshyaAdmin(true); pushRoute("/manshya-admin"); }
      else if (id === "adminBankingPanel") { mount("banking");          setShowBanking(true); }
      else if (id === "appLauncher")       { mount("appLauncher");      setShowAppLauncher(true); }
      else if (id === "afcApp")            { mount("afcApp");           setShowAFCApp(true); }
      else                                 { mount("postLogin");        setShowPostLogin(true); }
    });
  };

  const handleHomeNavigate = (id: string) => {
    startTransition(() => {
      setShowPostLogin(false);
      switch (id) {
        case "profile":      mount("userProfile");     setShowUserProfile(true);      break;
        // Transport & Devices
        case "device":       mount("afcApp");           setShowAFCApp(true);           break;
        // Banking & Payments
        case "account":      setVinkBankingAppInitialScreen(undefined); mount("vinkBankingApp"); setShowVinkBankingApp(true); break;
        case "managementPanel": mount("managementPanel"); setShowManagementPanel(true); pushRoute("/management-panel"); break;
        case "payments":
        case "transfer":
        case "cardless":     setVinkBankingAppInitialScreen("send"); mount("vinkBankingApp"); setShowVinkBankingApp(true); break;
        case "qr":           setVinkBankingAppInitialScreen("home"); mount("vinkBankingApp"); setShowVinkBankingApp(true); break;
        case "login":        setVinkBankingAppInitialScreen(undefined); mount("vinkBankingApp"); setShowVinkBankingApp(true); break;
        case "cards":        mount("creditCard");       setShowCreditCard(true);       break;
        // "Forex" previously opened GlobalBankingDashboard -- confirmed
        // that's a genuine treasury/operations tool ("Unified
        // Reference Account -> 5-country Nostro layer -> Core Engine
        // (FX + Compliance)", its own file header), not a consumer
        // feature. No dedicated personal-consumer forex screen exists
        // yet, so this stays on the consumer dashboard.
        case "forex":        mount("postLogin");        setShowPostLogin(true);        break;
        // Rewards -- "GuardMe" and "Insurance" tiles have no consumer-facing
        // destination anymore (insurance was removed), so they land on the
        // consumer dashboard rather than dead-end.
        case "guardme":
        case "insurance":    mount("postLogin");        setShowPostLogin(true);        break;
        case "rewards":      mount("rewards");          setShowRewards(true);          break;
        // Connectivity -- "Connect", "Mobile", and "VINK TV" tiles have no
        // consumer-facing destination (the backoffice mobile-network tool
        // they used to point near was removed entirely), so they land on
        // the consumer dashboard rather than dead-end.
        case "connect":
        case "mobile":
        case "vinktv":       mount("postLogin");        setShowPostLogin(true);        break;
        case "buy":
        case "settings":     mount("vinkMobileApp");    setShowVinkMobileApp(true);    break;
        // Contact & Support
        case "message":
        case "contact":      mount("contactUs");        setShowContactUs(true);        break;
        // "Elections" previously opened the same treasury dashboard as
        // "forex" above (same GlobalBankingDashboard mismatch) -- no
        // dedicated feature exists for this at all, so it now behaves
        // the same as the default fallback.
        case "elections":    mount("postLogin");        setShowPostLogin(true);        break;
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

  const applyForProductCategory = (category: "creditCard" | "loan" | "invest" | "rewards") => {
    startTransition(() => {
      if (category === "invest")      { mount("investApp");     setShowInvestApp(true); }
      else if (category === "rewards"){ mount("rewardsApp");    setShowRewardsApp(true); }
      else if (category === "creditCard") { mount("creditCardApp"); setShowCreditCardApp(true); }
      else if (category === "loan")   { mount("bizLoanApp");    setShowBusinessLoanApp(true); }
    });
  };

  const CORP_PATH: Record<string, string> = {
    "Account": "/corporate/account", "Solutions & Credit Cards": "/corporate/solutions-credit-cards",
    "Loan": "/corporate/loan",
    "Social Responsibility": "/corporate/social-responsibility",
  };
  const navigateCorporateItem = (item: string) => {
    if (CORP_PATH[item]) pushRoute(CORP_PATH[item]);
    setShowCorporateLedger(false);
    setShowCorporateCSR(false);
    if (item === "Account")                  { mount("corpLedger"); setCorporateLedgerCategory("account");   setShowCorporateLedger(true); return; }
    if (item === "Solutions & Credit Cards")  { mount("corpLedger"); setCorporateLedgerCategory("solutions"); setShowCorporateLedger(true); return; }
    if (item === "Loan")                      { mount("corpLedger"); setCorporateLedgerCategory("loan");      setShowCorporateLedger(true); return; }
    if (item === "Social Responsibility")     { mount("corpCSR");       setShowCorporateCSR(true); return; }
  };

  const BIZ_PATH: Record<string, string> = {
    "Start My Business": "/business/start-my-business", "Accounts": "/business/accounts",
    "Credit Cards": "/business/credit-cards", "Loans": "/business/loans",
    "Invest": "/business/invest",
    "Manage My Business": "/business/manage-my-business",
  };
  const navigateBusinessItem = (item: string) => {
    if (BIZ_PATH[item]) pushRoute(BIZ_PATH[item]);
    setShowBusinessLedger(false);
    setShowBusinessAccountSelector(false);
    setShowStartBusiness(false);
    setShowManageBusiness(false);
    if (item === "Start My Business") { mount("startBusiness");    setShowStartBusiness(true); return; }
    if (item === "Accounts")          { mount("bizAccountSelector"); setShowBusinessAccountSelector(true); return; }
    if (item === "Credit Cards")      { mount("bizLedger"); setBusinessLedgerCategory("creditCard"); setShowBusinessLedger(true); return; }
    if (item === "Loans")             { mount("bizLedger"); setBusinessLedgerCategory("loan"); setShowBusinessLedger(true); return; }
    if (item === "Invest")            { mount("bizLedger"); setBusinessLedgerCategory("invest"); setShowBusinessLedger(true); return; }
    if (item === "Manage My Business"){ mount("manageBusiness");   setShowManageBusiness(true); return; }
  };

  const pushRoute = (path: string) => {
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
  };

  const NAV_PATH: Record<string, string> = {
    "PersonalHome": "/personal",
    "BusinessHome": "/business",
    "Account": "/personal/account", "Credit Card": "/personal/credit-card", "Loan": "/personal/loan",
    "Invest": "/personal/invest", "Rewards": "/personal/rewards",
    "Start My Business": "/business/start-my-business", "Accounts": "/business/accounts",
    "Credit Cards": "/business/credit-cards", "Loans": "/business/loans",
    "Business:Invest": "/business/invest",
    "Manage My Business": "/business/manage-my-business",
    "Corporate:Account": "/corporate/account", "Corporate:Solutions & Credit Cards": "/corporate/solutions-credit-cards",
    "Corporate:Loan": "/corporate/loan",
    "Corporate:Social Responsibility": "/corporate/social-responsibility",
    "Contact Us": "/contact-us",
  };

  const handleSubNavClick = (item: string) => {
    if (NAV_PATH[item]) pushRoute(NAV_PATH[item]);
    startTransition(() => {
      if (item === "Business:Invest")   { mount("bizLedger");          setBusinessLedgerCategory("invest"); setShowBusinessLedger(true); return; }
      // Personal — top-level nav click opens the landing page; subnav items go through product selector
      if (item === "PersonalHome")      { mount("personalLanding"); setShowPersonalLanding(true); return; }
      if (item === "BusinessHome")      { mount("businessLanding"); setShowBusinessLanding(true); return; }
     if (item === "Account")           { mount("personalAccount"); setShowPersonalAccount(true); return; }
      if (item === "Credit Card")       { mount("personalAccount"); mount("personalLedger"); setLedgerCategory("creditCard"); setShowPersonalLedger(true); return; }
      if (item === "Loan")              { mount("personalAccount"); mount("personalLedger"); setLedgerCategory("loan"); setShowPersonalLedger(true); return; }
      if (item === "Invest")            { mount("personalAccount"); mount("personalLedger"); setLedgerCategory("invest"); setShowPersonalLedger(true); return; }
      if (item === "Rewards")           { mount("personalAccount"); mount("personalLedger"); setLedgerCategory("rewards"); setShowPersonalLedger(true); return; }
      // Business — Header.tsx's BUSINESS_SUB_NAV sends these exact bare labels
      if (item === "Start My Business") { mount("startBusiness");      setShowStartBusiness(true); return; }
      if (item === "Accounts")          { mount("bizAccountSelector"); setShowBusinessAccountSelector(true); return; }
      if (item === "Credit Cards")      { mount("bizLedger");          setBusinessLedgerCategory("creditCard"); setShowBusinessLedger(true); return; }
      if (item === "Loans")             { mount("bizLedger");          setBusinessLedgerCategory("loan"); setShowBusinessLedger(true); return; }
      if (item === "Manage My Business"){ mount("manageBusiness");     setShowManageBusiness(true); return; }
      // Corporate — Header.tsx's CORPORATE_SUB_NAV items are dispatched with a
      // "Corporate:" prefix (see handleNavClick's onClick for CORPORATE_SUB_NAV),
      // so matches must include that prefix and the exact sub-nav label.
      if (item === "Corporate:Account")                  { mount("corpLedger"); setCorporateLedgerCategory("account");   setShowCorporateLedger(true); return; }
      if (item === "Corporate:Solutions & Credit Cards")  { mount("corpLedger"); setCorporateLedgerCategory("solutions"); setShowCorporateLedger(true); return; }
      if (item === "Corporate:Loan")                      { mount("corpLedger"); setCorporateLedgerCategory("loan");      setShowCorporateLedger(true); return; }
      if (item === "Corporate:Social Responsibility")     { mount("corpCSR");       setShowCorporateCSR(true); return; }
    });
  };

  // Every public page, by name, with the function that closes it. Closing from the header (Close, or switching section) uses this list, the same pages
  // the header is shown for (sitePages.ts), so a page can never stay open underneath another.
  const sitePageClosers: Record<string, (open: boolean) => void> = { showPersonalLanding: setShowPersonalLanding, showPersonalAccount: setShowPersonalAccount, showPersonalLedger: setShowPersonalLedger, showCreditCard: setShowCreditCard, showCreditCardApp: setShowCreditCardApp, showLoan: setShowLoan, showInvest: setShowInvest, showRewards: setShowRewards, showInvestApp: setShowInvestApp, showRewardsApp: setShowRewardsApp, showAccountApp: setShowAccountApp, showBusinessLanding: setShowBusinessLanding, showStartBusiness: setShowStartBusiness, showBusinessAccountSelector: setShowBusinessAccountSelector, showBusinessAccounts: setShowBusinessAccounts, showBusinessLedger: setShowBusinessLedger, showBusinessLoanApp: setShowBusinessLoanApp, showManageBusiness: setShowManageBusiness, showCorporateLedger: setShowCorporateLedger, showCorporateLoanApp: setShowCorporateLoanApp, showCorporateCSR: setShowCorporateCSR, showInvestorRelations: setShowInvestorRelations, selectorOpen: setSelectorOpen, showContactUs: setShowContactUs, showAboutVINK: setShowAboutVINK, showCareers: setShowCareers, showSwitchToVINK: setShowSwitchToVINK, showSafetySecurity: setShowSafetySecurity, showTaxiAssociations: setShowTaxiAssociations, showJobApp: setShowJobApp, showLegal: setShowLegal, showBranchLocator: setShowBranchLocator, showSponsorship: setShowSponsorship, showBankingFees: setShowBankingFees, showBankingGuide: setShowBankingGuide, showBankingChannels: setShowBankingChannels, showExchangeRates: setShowExchangeRates, showLatestOffers: setShowLatestOffers, showMarketIndices: setShowMarketIndices, showVinkBlog: setShowVinkBlog };
  // The signed-in tools, which show the header as well, and are closed the same way.
  const appPageClosers: Record<string, (open: boolean) => void> = { showPostLogin: setShowPostLogin, showUserProfile: setShowUserProfile, showOwners: setShowOwners, showInvestors: setShowInvestors, showSuperAdmin: setShowSuperAdmin, showBanking: setShowBanking, showDriveDashboard: setShowDriveDashboard, showOwnerDashboard: setShowOwnerDashboard, showTaxiAssociationDashboard: setShowTaxiAssociationDashboard, showTerminalManagement: setShowTerminalManagement, showControlCentre: setShowControlCentre, showInvestorDashboard: setShowInvestorDashboard, showManagementPanel: setShowManagementPanel, showTokenReader: setShowTokenReader, showSIMApp: setShowSIMApp, showAFCApp: setShowAFCApp, showVinkBankingApp: setShowVinkBankingApp, showVinkBusinessBankingApp: setShowVinkBusinessBankingApp, showVinkCorporateBankingApp: setShowVinkCorporateBankingApp, showVinkMobileApp: setShowVinkMobileApp, showAppLauncher: setShowAppLauncher, showRevenueDashboard: setShowRevenueDashboard, showGlobalBanking: setShowGlobalBanking, showFinancialReports: setShowFinancialReports, showAdminDashboard: setShowAdminDashboard, showAFCDashboard: setShowAFCDashboard, showAdminApps: setShowAdminApps, showCardNetwork: setShowCardNetwork, showManagementHub: setShowManagementHub, showLogin: setShowLogin, showManshya: setShowManshya, showManshyaAdmin: setShowManshyaAdmin, showManshyaPay: setShowManshyaPay };
  const closeAllRoutedViewers = () => {
    for (const set of [...Object.values(sitePageClosers), ...Object.values(appPageClosers)]) set(false);
    setShowManshya(false); setShowManshyaAdmin(false); setShowManshyaPay(false); setAuthLink(null); setPortal(null); setAdminBank(false);
  };

  // ── Persistent top nav (Personal/Business/Corporate) ─────────
  // Shown above every full-screen site page so switching sections never
  // requires backing out to the homepage first.
  // Every public page shows the header: the list of pages and the rule are in sitePages.ts (a test makes sure no page is left out).
  const { section: activeSiteSection, showNav: siteNav } = siteChrome({
    showPersonalLanding, showPersonalAccount, showPersonalLedger, showCreditCard, showCreditCardApp, showLoan, showInvest, showRewards, showInvestApp, showRewardsApp, showAccountApp,
    showBusinessLanding, showStartBusiness, showBusinessAccountSelector, showBusinessAccounts, showBusinessLedger, showBusinessLoanApp, showManageBusiness,
    showCorporateLedger, showCorporateLoanApp, showCorporateCSR, showInvestorRelations,
    selectorOpen, showContactUs, showAboutVINK, showCareers, showSwitchToVINK, showSafetySecurity, showTaxiAssociations, showJobApp,
    showLegal, showBranchLocator, showSponsorship, showBankingFees, showBankingGuide, showBankingChannels, showExchangeRates, showLatestOffers, showMarketIndices, showVinkBlog,
    showPostLogin, showUserProfile, showOwners, showInvestors, showSuperAdmin, showBanking, showDriveDashboard, showOwnerDashboard, showTaxiAssociationDashboard, showTerminalManagement, showControlCentre, showInvestorDashboard, showManagementPanel, showTokenReader, showSIMApp, showAFCApp, showVinkBankingApp, showVinkBusinessBankingApp, showVinkCorporateBankingApp, showVinkMobileApp, showAppLauncher, showRevenueDashboard, showGlobalBanking, showFinancialReports, showAdminDashboard, showAFCDashboard, showAdminApps, showCardNetwork, showManagementHub, showLogin, showManshya, showManshyaAdmin, showManshyaPay,
  });
  // The sign-in pages show the header too: the password-reset and verify-email links, and a role dashboard while nobody is signed in (its "Please sign in" screen).
  const showPersistentNav = siteNav || authLink !== null || (portal !== null && !getSession());

  // Pages draw their own logo + X bar; under the site header that is a second logo, so mark those bars for theme.css to hide (pages mount lazily, hence the observer).
  useEffect(() => {
    if (!showPersistentNav) return;
    markPageBars();
    const obs = new MutationObserver(() => markPageBars());
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [showPersistentNav]);

  const goToSection = (section: "Personal" | "Business" | "Corporate") => {
    startTransition(() => {
      closeAllRoutedViewers();
      if (section === "Personal")    { mount("personalLanding");     setShowPersonalLanding(true);     pushRoute("/personal"); }
      if (section === "Business")    { mount("bizAccountSelector");  setShowBusinessAccountSelector(true); pushRoute("/business/accounts"); }
      if (section === "Corporate")   { mount("corpLedger"); setCorporateLedgerCategory("account"); setShowCorporateLedger(true); pushRoute("/corporate/account"); }
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
      const map: Record<string, string> = { account: "account", "credit-card": "creditCard", loan: "loan", invest: "invest", rewards: "rewards" };
      const cat = map[seg[1]];
      if (!cat) return false;
      mount("personalAccount");
      if (cat === "account") { setShowPersonalAccount(true); } else { mount("personalLedger"); setLedgerCategory(cat as any); setShowPersonalLedger(true); }
      return true;
    }
    if (seg[0] === "business" && !seg[1]) {
      mount("businessLanding"); setShowBusinessLanding(true); return true;
    }
    if (seg[0] === "business" && seg[1]) {
      const map: Record<string, string> = {
        "start-my-business": "startBusiness", "accounts": "bizAccountSelector", "credit-cards": "bizLedger:creditCard",
        "loans": "bizLedger:loan", "invest": "bizLedger:invest",
        "manage-my-business": "manageBusiness",
      };
      const key = map[seg[1]];
      if (!key) return false;
      if (key.startsWith("bizLedger:")) { mount("bizLedger"); setBusinessLedgerCategory(key.split(":")[1] as any); setShowBusinessLedger(true); }
      else if (key === "startBusiness")      { mount("startBusiness"); setShowStartBusiness(true); }
      else if (key === "bizAccountSelector") { mount("bizAccountSelector"); setShowBusinessAccountSelector(true); }
      else if (key === "manageBusiness")     { mount("manageBusiness"); setShowManageBusiness(true); }
      return true;
    }
    if (seg[0] === "corporate" && seg[1]) {
      const map: Record<string, string> = {
        "account": "corpLedger:account", "solutions-credit-cards": "corpLedger:solutions", "loan": "corpLedger:loan",
        "social-responsibility": "corpCSR",
      };
      const key = map[seg[1]];
      if (!key) return false;
      if (key.startsWith("corpLedger:")) { mount("corpLedger"); setCorporateLedgerCategory(key.split(":")[1] as any); setShowCorporateLedger(true); }
      else if (key === "corpCSR")    { mount("corpCSR"); setShowCorporateCSR(true); }
      return true;
    }
    if (path === "/contact-us") { mount("contactUs"); setShowContactUs(true); return true; }
    if (path === "/management-panel") { mount("managementPanel"); setShowManagementPanel(true); return true; }
    // The VINK card reader for a driver's phone: it signs in as the registered device, not as a user.
    if (path === "/reader") { mount("tokenReader"); setShowTokenReader(true); return true; }
    // VINK: dashboard is customer-only (it shows a sign-in prompt to anyone else), back office is staff-only,
    // /pay is the public hosted checkout for payment links.
    // Role dashboards: /portal/personal | driver | marshal | owner | association. The server decides who may open each one.
    // Staff only (the server enforces it): every dashboard user's bank account, and review of Business accounts.
    if (path === "/admin/config") { mount("adminConfig"); setAdminConfig(true); return true; }
    if (path === "/admin/bank-links") { mount("adminBank"); setAdminBank(true); return true; }
    if (seg[0] === "portal" && seg[1] && seg[1] in PORTALS) { mount("portal"); setPortal(seg[1] as PortalKey); return true; }
    if (path === "/reset-password") { mount("authLink"); setAuthLink("reset");  return true; }
    if (path === "/verify-email")   { mount("authLink"); setAuthLink("verify"); return true; }
    if (path === "/manshya")       { mount("manshya");      setShowManshya(true);      return true; }
    if (path === "/manshya-admin") { mount("manshyaAdmin"); setShowManshyaAdmin(true); return true; }
    if (path === "/pay")           { mount("manshyaPay");   setShowManshyaPay(true);   return true; }
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
      if      (id === "banking")     { setVinkBankingAppInitialScreen(undefined); mount("vinkBankingApp");  setShowVinkBankingApp(true); }
      else if (id === "afc")         { mount("afcApp");          setShowAFCApp(true); }
    });
  };

  const handleFooterLink = (label: string) => {
    startTransition(() => {
      if (label === "About VINK")                                 open("aboutVINK",          () => setShowAboutVINK(true));
      if (label === "Investor Relations")                        open("investorRelations",  () => setShowInvestorRelations(true));
      if (label === "Careers")                                   open("careers",            () => setShowCareers(true));
      if (label === "Contact Us")                                { setContactTab("connect"); open("contactUs", () => setShowContactUs(true)); }
      if (label === "Send your feedback")                        { setContactTab("feedback"); open("contactUs", () => setShowContactUs(true)); }
      if (label === "Switch to VINK")                             open("switchToVINK",        () => setShowSwitchToVINK(true));
      if (label === "Business debit order switching")            open("switchToVINK",        () => setShowSwitchToVINK(true));
      if (label === "Job Application")                            open("jobapp",             () => setShowJobApp(true));
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
      if (label === "Banking rates and fees")                    { mount("bankingFees"); setShowBankingFees(true); }
      if (label === "Guide to help you bank")                    { mount("bankingGuide"); setShowBankingGuide(true); }
      if (label === "App, Online and other banking")             { mount("bankingChannels"); setShowBankingChannels(true); }
      if (label === "Exchange rates")                            { mount("exchangeRates"); setShowExchangeRates(true); }
      if (label === "Latest Offers")                             { mount("latestOffers"); setShowLatestOffers(true); }
      if (label === "Market Indices")                            { mount("marketIndices"); setShowMarketIndices(true); }
      if (label === "VINK blog")                                 { mount("vinkBlog"); setShowVinkBlog(true); }
    });
  };

  // Footer now renders on every informational/application page, not just
  // the homepage -- those Footer instances don't have handleFooterLink
  // passed to them directly (would mean prop-drilling it through 50+ page
  // components), so they dispatch a "vink:footer-link" CustomEvent instead
  // (see Footer.tsx). This is the single listener that catches all of
  // those and routes them through the exact same navigation logic the
  // homepage's own Footer already uses, so a link behaves identically
  // regardless of which page it was clicked from.
  useEffect(() => {
    const listener = (e: Event) => {
      const label = (e as CustomEvent<{ label: string }>).detail?.label;
      if (label) handleFooterLink(label);
    };
    window.addEventListener("vink:footer-link", listener);
    return () => window.removeEventListener("vink:footer-link", listener);
  });

  // Dynamic <title>/meta description per section -- without this, every
  // route in this single-page app shares one static title/description
  // (set once in index.html), so Google would see identical metadata for
  // every section regardless of which one was actually visited. Each of
  // these gets its own real, keyword-relevant metadata while open,
  // restored to the site default when closed again.
  useEffect(() => { if (showStartBusiness)      return setPageMeta(PAGE_META.business.title,     PAGE_META.business.description); }, [showStartBusiness]);

  const handleSelectorSelect = (type: string, productId: string) => {
    setSelectorOpen(false);
    startTransition(() => {
      if (type === "invest")     { mount("investApp");      setShowInvestApp(true); }
      else if (type === "rewards"){ mount("rewardsApp");    setShowRewardsApp(true); }
      else if (type === "account"){ mount("accountApp");    setShowAccountApp(true); }
      else if (type === "creditCard") { mount("creditCardApp"); setShowCreditCardApp(true); }
      else if (type === "loan")  { mount("bizLoanApp");     setShowBusinessLoanApp(true); }
    });
  };

  return (
    <div className={`min-h-screen bg-transparent${showPersistentNav ? " has-persistent-nav" : ""}`}>
      <Toaster position="top-right" theme={theme.resolved} richColors closeButton duration={4000} />

      {showPersistentNav && (
        <PersistentTopNav active={activeSiteSection} onSelect={goToSection} onHome={goHome} />
      )}

      {/* ── Homepage ────────────────────────────────────────────────────────── */}
      <ErrorBoundary>
        <Header
          onHome={goHome}
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

      <main id="main" tabIndex={-1} className="outline-none">
      <ErrorBoundary>
        <HeroSection onApplyClick={() => openSelector("account")} />
      </ErrorBoundary>

      <SearchSection onFindCard={() => openSelector("creditCard")} />

      <LazySection><Suspense fallback={null}><FeaturesSection /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><ProtectionSection /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><CreditCardsSection onApply={() => openSelector("creditCard")} /></Suspense></LazySection>
      <LazySection><Suspense fallback={null}><BusinessPowerSection onSubNavClick={handleSubNavClick} /></Suspense></LazySection>
      {/* AppShowcaseSection and the App Launcher are admin-only now --
          see BankingDashboard's "App Preview" sidebar button. Not
          reachable from the public site at all: none of the apps are
          actually published yet (every download CTA now says "Coming
          Soon"), so a public-facing "browse and preview our apps"
          experience would be showing incomplete/simulated features to
          real visitors as if they were real. */}
      </main>

      <LazySection>
        <Suspense fallback={null}>
          <Footer onLinkClick={handleFooterLink} />
        </Suspense>
      </LazySection>

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}

      {/* Post-login */}
      {has("postLogin")       && <Suspense fallback={null}><PostLoginHome          isOpen={showPostLogin}       onClose={() => setShowPostLogin(false)}    onNavigate={handleHomeNavigate} onDashboardSelect={handleDashboardSelect} /></Suspense>}
      {has("userProfile")     && <Suspense fallback={null}><UserProfileViewer      isOpen={showUserProfile}     onClose={() => setShowUserProfile(false)}  onSignOut={() => { setShowUserProfile(false); mount("postLogin"); setShowPostLogin(true); }} /></Suspense>}
      {has("owners")          && <Suspense fallback={null}><OwnersDashboard        isOpen={showOwners}          onClose={() => setShowOwners(false)} /></Suspense>}
      {has("investors")       && <Suspense fallback={null}><InvestorsDashboard     isOpen={showInvestors}       onClose={() => setShowInvestors(false)} /></Suspense>}
      {has("superAdmin")      && <Suspense fallback={null}><SuperAdminDashboard    isOpen={showSuperAdmin}      onClose={() => setShowSuperAdmin(false)} /></Suspense>}
      {has("banking")         && <Suspense fallback={null}><BankingDashboard       isOpen={showBanking}         onClose={() => setShowBanking(false)} onOpenDriveDashboard={() => { mount("driveDashboard"); setShowDriveDashboard(true); }} onOpenOwnerDashboard={() => { mount("ownerDashboard"); setShowOwnerDashboard(true); }} onOpenTaxiAssociationDashboard={() => { mount("taxiAssociationDashboard"); setShowTaxiAssociationDashboard(true); }} onOpenInvestorDashboard={() => { mount("investorDashboard"); setShowInvestorDashboard(true); }} onOpenTerminalManagement={() => { mount("terminalManagement"); setShowTerminalManagement(true); }} onOpenControlCentre={() => { mount("controlCentre"); setShowControlCentre(true); }} onOpenAppLauncher={() => { mount("appLauncher"); setShowAppLauncher(true); }} /></Suspense>}
      {has("controlCentre") && <Suspense fallback={null}><ControlCentreViewer isOpen={showControlCentre} onClose={() => setShowControlCentre(false)} onOpenTerminalManagement={() => { mount("terminalManagement"); setShowControlCentre(false); setShowTerminalManagement(true); }} /></Suspense>}
      {has("terminalManagement") && <Suspense fallback={null}><TerminalManagementViewer isOpen={showTerminalManagement} onClose={() => setShowTerminalManagement(false)} /></Suspense>}
      {has("driveDashboard")  && <Suspense fallback={null}><DriveDashboardViewer   isOpen={showDriveDashboard}  onClose={() => setShowDriveDashboard(false)} driverName={getSession()?.name} /></Suspense>}
      {has("ownerDashboard")  && <Suspense fallback={null}><OwnerFleetDashboardViewer isOpen={showOwnerDashboard} onClose={() => setShowOwnerDashboard(false)} /></Suspense>}
      {has("taxiAssociationDashboard") && <Suspense fallback={null}><TaxiAssociationDashboardViewer isOpen={showTaxiAssociationDashboard} onClose={() => setShowTaxiAssociationDashboard(false)} /></Suspense>}
      {has("investorDashboard") && <Suspense fallback={null}><InvestorFleetDashboardViewer isOpen={showInvestorDashboard} onClose={() => setShowInvestorDashboard(false)} investorName={getSession()?.name} onOpenRevenueDashboard={() => { mount("revenueDash"); setShowRevenueDashboard(true); }} /></Suspense>}
      {has("adminConfig")     && adminConfig && <Suspense fallback={null}><AdminConfig isOpen onClose={() => { setAdminConfig(false); pushRoute("/"); }} /></Suspense>}
      {has("adminBank")       && adminBank && <Suspense fallback={null}><AdminBankLinks isOpen onClose={() => { setAdminBank(false); pushRoute("/"); }} /></Suspense>}
      {has("portal")          && portal && <Suspense fallback={null}><RolePortal portal={portal} isOpen onClose={() => { setPortal(null); pushRoute("/"); }} /></Suspense>}
      {has("authLink")        && authLink && <Suspense fallback={null}><AuthLinkPage kind={authLink} isOpen onClose={() => { setAuthLink(null); window.history.replaceState({}, "", "/"); }} /></Suspense>}
      {has("manshya")         && <Suspense fallback={null}><ManshyaDashboard      isOpen={showManshya}         onClose={() => { setShowManshya(false); pushRoute("/"); }} onSignOut={() => { setIsLoggedIn(false); setUserRole("personal"); window.dispatchEvent(new Event("vink:open-login")); }} /></Suspense>}
      {has("manshyaAdmin")    && <Suspense fallback={null}><ManshyaAdmin          isOpen={showManshyaAdmin}    onClose={() => { setShowManshyaAdmin(false); pushRoute("/"); }} /></Suspense>}
      {has("manshyaPay")      && <Suspense fallback={null}><ManshyaPay            isOpen={showManshyaPay}      onClose={() => { setShowManshyaPay(false); window.history.replaceState({}, "", "/"); }} /></Suspense>}
      {has("tokenReader")     && <Suspense fallback={null}><TokenReader isOpen={showTokenReader} /></Suspense>}
      {has("managementPanel") && <Suspense fallback={null}><ManagementPanelViewer  isOpen={showManagementPanel} onClose={() => { setShowManagementPanel(false); pushRoute("/"); }} adminName={getSession()?.name} adminRole={getSession()?.role === "superadmin" ? "Super Administrator" : getSession()?.role === "owner" ? "System Owner" : getSession()?.role} role={getSession()?.role} /></Suspense>}

      {/* Personal products */}
      {has("personalLanding") && <Suspense fallback={null}><PersonalLandingViewer isOpen={showPersonalLanding} onClose={() => { setShowPersonalLanding(false); pushRoute("/"); }} onNavigate={(item) => { setShowPersonalLanding(false); handleSubNavClick(item); }} onApplyClick={() => { setShowPersonalLanding(false); handleSubNavClick("Account"); }} onSecurityClick={() => { mount("safetySecurity"); setShowSafetySecurity(true); }} /></Suspense>}
      {has("businessLanding") && <Suspense fallback={null}><BusinessLandingViewer isOpen={showBusinessLanding} onClose={() => { setShowBusinessLanding(false); pushRoute("/"); }} onNavigate={(item) => { setShowBusinessLanding(false); handleSubNavClick(item); }} onApplyClick={() => { setShowBusinessLanding(false); handleSubNavClick("Accounts"); }} onSecurityClick={() => { mount("safetySecurity"); setShowSafetySecurity(true); }} /></Suspense>}
      {has("safetySecurity")  && <Suspense fallback={null}><SafetySecurityViewer  isOpen={showSafetySecurity} onClose={() => setShowSafetySecurity(false)} /></Suspense>}
      {has("personalAccount") && <Suspense fallback={null}><PersonalAccountViewer  isOpen={showPersonalAccount} onClose={() => { setShowPersonalAccount(false); pushRoute("/"); }} onNavigate={(cat) => { setShowPersonalAccount(false); setLedgerCategory(cat); setShowPersonalLedger(true); pushRoute(`/personal/${cat === "creditCard" ? "credit-card" : cat}`); }} onOpenBankingApp={() => { setShowPersonalAccount(false); mount("postLogin"); setShowPostLogin(true); }} /></Suspense>}
      {has("personalLedger")  && <Suspense fallback={null}><PersonalProductLedgerViewer isOpen={showPersonalLedger} onClose={() => { setShowPersonalLedger(false); pushRoute("/"); }} initialCategory={ledgerCategory} onNavigateToAccount={() => { setShowPersonalLedger(false); setShowPersonalAccount(true); pushRoute("/personal/account"); }} onApply={applyForProductCategory} /></Suspense>}
      {has("creditCard")      && <Suspense fallback={null}><CreditCardViewer       isOpen={showCreditCard}      onClose={() => setShowCreditCard(false)} /></Suspense>}
      {has("creditCardApp")   && <Suspense fallback={null}><CreditCardApplicationViewer isOpen={showCreditCardApp} onClose={() => setShowCreditCardApp(false)} /></Suspense>}
      {has("loan")            && <Suspense fallback={null}><LoanViewer             isOpen={showLoan}            onClose={() => setShowLoan(false)} /></Suspense>}
      {has("invest")          && <Suspense fallback={null}><InvestViewer           isOpen={showInvest}          onClose={() => setShowInvest(false)} /></Suspense>}
      {has("rewards")         && <Suspense fallback={null}><RewardsViewer          isOpen={showRewards}         onClose={() => setShowRewards(false)} /></Suspense>}
      {has("investApp")       && <Suspense fallback={null}><ServiceApplicationViewer serviceType="invest"   isOpen={showInvestApp}     onClose={() => setShowInvestApp(false)} /></Suspense>}
      {has("rewardsApp")      && <Suspense fallback={null}><ServiceApplicationViewer serviceType="rewards"  isOpen={showRewardsApp}    onClose={() => setShowRewardsApp(false)} /></Suspense>}
      {has("accountApp")      && <Suspense fallback={null}><ServiceApplicationViewer serviceType="account"  isOpen={showAccountApp}    onClose={() => setShowAccountApp(false)} /></Suspense>}

      {/* Product selector */}
      {has("productSelector") && <Suspense fallback={null}><ProductSelectorViewer  isOpen={selectorOpen} category={selectorCategory} onClose={() => setSelectorOpen(false)} onSelect={handleSelectorSelect} /></Suspense>}

      {/* Business */}
      {has("startBusiness")      && <Suspense fallback={null}><StartMyBusinessViewer       isOpen={showStartBusiness}       onClose={() => { setShowStartBusiness(false); pushRoute("/"); }} onNavigate={navigateBusinessItem} /></Suspense>}
      {has("bizAccountSelector") && <Suspense fallback={null}><BusinessAccountSelectorViewer isOpen={showBusinessAccountSelector} onClose={() => { setShowBusinessAccountSelector(false); pushRoute("/"); }} onNavigate={(item) => navigateBusinessItem(item)} onApply={(type) => { setShowBusinessAccountSelector(false); mount("bizAccounts"); setChosenBusinessAccountType(type); setShowBusinessAccounts(true); }} onOpenApp={() => { mount("vinkBusinessBankingApp"); setShowVinkBusinessBankingApp(true); }} /></Suspense>}
      {has("bizAccounts")        && <Suspense fallback={null}><BusinessAccountApplicationViewer isOpen={showBusinessAccounts} onClose={() => { setShowBusinessAccounts(false); pushRoute("/"); }} initialAccountType={chosenBusinessAccountType} /></Suspense>}
      {has("bizLedger") && <Suspense fallback={null}><BusinessProductLedgerViewer isOpen={showBusinessLedger} onClose={() => { setShowBusinessLedger(false); pushRoute("/"); }} initialCategory={businessLedgerCategory} onNavigate={(item) => navigateBusinessItem(item)} onApply={applyForProductCategory} /></Suspense>}
      {has("bizLoanApp")         && <Suspense fallback={null}><BusinessLoanApplicationViewer isOpen={showBusinessLoanApp}   onClose={() => setShowBusinessLoanApp(false)} /></Suspense>}
      {has("manageBusiness")     && <Suspense fallback={null}><ManageMyBusinessViewer      isOpen={showManageBusiness}      onClose={() => { setShowManageBusiness(false); pushRoute("/"); }} onNavigate={navigateBusinessItem} /></Suspense>}

      {/* Corporate */}
      {has("corpLedger")         && <Suspense fallback={null}><CorporateProductLedgerViewer isOpen={showCorporateLedger} onClose={() => { setShowCorporateLedger(false); pushRoute("/"); }} initialCategory={corporateLedgerCategory} onNavigate={(item) => navigateCorporateItem(item)} onOpenApp={() => { mount("vinkCorporateBankingApp"); setShowVinkCorporateBankingApp(true); }} /></Suspense>}
      {has("corpLoanApp")        && <Suspense fallback={null}><CorporateLoanApplicationViewer isOpen={showCorporateLoanApp} onClose={() => setShowCorporateLoanApp(false)} /></Suspense>}
      {has("corpCSR")            && <Suspense fallback={null}><CorporateSocialResponsibilityViewer isOpen={showCorporateCSR} onClose={() => { setShowCorporateCSR(false); pushRoute("/"); }} onNavigate={(item) => navigateCorporateItem(item)} /></Suspense>}

      {/* Operations */}
      {has("globalBanking")      && <Suspense fallback={null}><GlobalBankingDashboard      isOpen={showGlobalBanking}       onClose={() => setShowGlobalBanking(false)} /></Suspense>}
      {has("financialReports")   && <Suspense fallback={null}><FinancialReportsViewer      isOpen={showFinancialReports}    onClose={() => setShowFinancialReports(false)} /></Suspense>}
      {has("adminDashboard")     && <Suspense fallback={null}><AdminDashboard             isOpen={showAdminDashboard}      onClose={() => setShowAdminDashboard(false)} /></Suspense>}
      {has("afcDashboard")       && <Suspense fallback={null}><AFCManagementDashboard     isOpen={showAFCDashboard}        onClose={() => setShowAFCDashboard(false)} /></Suspense>}
      {has("adminApps")          && <Suspense fallback={null}><AdminApplicationsViewer    isOpen={showAdminApps}           onClose={() => setShowAdminApps(false)} /></Suspense>}
      {has("cardNetwork")        && <Suspense fallback={null}><CardNetworkDashboard       isOpen={showCardNetwork}         onClose={() => setShowCardNetwork(false)} /></Suspense>}
      {has("investorRelations")  && <Suspense fallback={null}><InvestorRelationsViewer    isOpen={showInvestorRelations}   onClose={() => setShowInvestorRelations(false)} /></Suspense>}

      {/* Mobile apps */}
      {has("afcApp")             && <Suspense fallback={null}><AFCApp                isOpen={showAFCApp}             onClose={() => setShowAFCApp(false)} /></Suspense>}
      {has("revenueDash")        && <Suspense fallback={null}><RevenueDashboard      isOpen={showRevenueDashboard}   onClose={() => setShowRevenueDashboard(false)} /></Suspense>}
      {has("vinkBankingApp")     && <Suspense fallback={null}><VinkBankingApp        isOpen={showVinkBankingApp}     onClose={() => setShowVinkBankingApp(false)} onOpenManagementPanel={() => { mount("managementPanel"); setShowManagementPanel(true); pushRoute("/management-panel"); }} onOpenAdminPanel={() => { mount("banking"); setShowBanking(true); }} initialScreen={vinkBankingAppInitialScreen} /></Suspense>}
      {has("vinkBusinessBankingApp") && <Suspense fallback={null}><VinkBusinessBankingApp isOpen={showVinkBusinessBankingApp} onClose={() => setShowVinkBusinessBankingApp(false)} /></Suspense>}
      {has("vinkCorporateBankingApp") && <Suspense fallback={null}><VinkCorporateBankingApp isOpen={showVinkCorporateBankingApp} onClose={() => setShowVinkCorporateBankingApp(false)} /></Suspense>}
      {has("vinkMobileApp")      && <Suspense fallback={null}><VinkMobileApp         isOpen={showVinkMobileApp}      onClose={() => setShowVinkMobileApp(false)} onNavigate={handleMobileNavigate} /></Suspense>}
      {has("appLauncher")        && <Suspense fallback={null}><AppLauncher           isOpen={showAppLauncher}        onClose={() => setShowAppLauncher(false)} onLaunchApp={(id) => {
        startTransition(() => {
          setShowAppLauncher(false);
          if (id === "afc")       { mount("afcApp");             setShowAFCApp(true); }
          if (id === "revenue")   { mount("revenueDash");        setShowRevenueDashboard(true); }
          if (id === "banking")   { setVinkBankingAppInitialScreen(undefined); mount("vinkBankingApp");     setShowVinkBankingApp(true); }
        });
      }} /></Suspense>}

      {/* Footer pages */}
      {has("aboutVINK")           && <Suspense fallback={null}><AboutVINKViewer       isOpen={showAboutVINK}           onClose={() => setShowAboutVINK(false)} /></Suspense>}
      {has("careers")            && <Suspense fallback={null}><CareersViewer        isOpen={showCareers}            onClose={() => setShowCareers(false)} /></Suspense>}
      {has("contactUs")          && <Suspense fallback={null}><ContactUsViewer            isOpen={showContactUs}  onClose={() => { setShowContactUs(false); pushRoute("/"); }} initialTab={contactTab} /></Suspense>}
      {has("legal")              && <Suspense fallback={null}><LegalComplianceViewer      isOpen={showLegal}      onClose={() => setShowLegal(false)} initialTab={legalTab} /></Suspense>}
      {has("switchToVINK")        && <Suspense fallback={null}><SwitchToVINKViewer          isOpen={showSwitchToVINK} onClose={() => setShowSwitchToVINK(false)} /></Suspense>}
      {has("branchLocator")       && <Suspense fallback={null}><BranchLocatorViewer         isOpen={showBranchLocator} onClose={() => setShowBranchLocator(false)} /></Suspense>}
      {has("sponsorship")         && <Suspense fallback={null}><SponsorshipViewer           isOpen={showSponsorship} onClose={() => setShowSponsorship(false)} /></Suspense>}
      {has("bankingFees")         && <Suspense fallback={null}><BankingFeesViewer           isOpen={showBankingFees} onClose={() => setShowBankingFees(false)} /></Suspense>}
      {has("bankingGuide")        && <Suspense fallback={null}><BankingGuideViewer          isOpen={showBankingGuide} onClose={() => setShowBankingGuide(false)} /></Suspense>}
      {has("bankingChannels")     && <Suspense fallback={null}><BankingChannelsViewer       isOpen={showBankingChannels} onClose={() => setShowBankingChannels(false)} /></Suspense>}
      {has("exchangeRates")       && <Suspense fallback={null}><ExchangeRatesViewer         isOpen={showExchangeRates} onClose={() => setShowExchangeRates(false)} /></Suspense>}
      {has("latestOffers")        && <Suspense fallback={null}><LatestOffersViewer          isOpen={showLatestOffers} onClose={() => setShowLatestOffers(false)} /></Suspense>}
      {has("marketIndices")       && <Suspense fallback={null}><MarketIndicesViewer         isOpen={showMarketIndices} onClose={() => setShowMarketIndices(false)} /></Suspense>}
      {has("vinkBlog")            && <Suspense fallback={null}><VinkBlogViewer              isOpen={showVinkBlog} onClose={() => setShowVinkBlog(false)} /></Suspense>}
      {has("managementHub")      && <Suspense fallback={null}><ManagementHub              isOpen={showManagementHub}       onClose={() => setShowManagementHub(false)} /></Suspense>}
      {has("taxiAssociations")   && <Suspense fallback={null}><TaxiAssociationsViewer       isOpen={showTaxiAssociations} onClose={() => setShowTaxiAssociations(false)} /></Suspense>}
      {has("jobapp")             && <Suspense fallback={null}><JobApplicationViewer         isOpen={showJobApp}          onClose={() => setShowJobApp(false)} /></Suspense>}
    </div>
  );
}
