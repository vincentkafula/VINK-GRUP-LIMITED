/**
 * Which open pages show the site header (Personal / Business / Corporate) above them.
 *
 * Every public page of the website is a full-screen page that opens over the home page. The header strip (PersistentTopNav) is shown whenever one of them is
 * open, so a visitor can always switch section, search, or go home. The list lives here, in one place, so a new page cannot be added without deciding whether it
 * gets the header (sitePages.test.ts fails if a page the website opens is in neither list).
 *
 * Left out on purpose: the signed-in tools (dashboards, the management panel, account tools such as Financial Reports, the field reader and the app previews).
 * They are applications with their own layout, not pages of the public site.
 */
export type SiteSection = "Personal" | "Business" | "Corporate";

/** The pages that belong to a section. The section's name is highlighted in the header while one of them is open. */
export const SECTION_PAGES: Record<SiteSection, readonly string[]> = {
  Personal: ["showPersonalLanding", "showPersonalAccount", "showPersonalLedger", "showCreditCard", "showCreditCardApp", "showLoan", "showInvest", "showRewards", "showInvestApp", "showRewardsApp", "showAccountApp"],
  Business: ["showBusinessLanding", "showStartBusiness", "showBusinessAccountSelector", "showBusinessAccounts", "showBusinessLedger", "showBusinessLoanApp", "showManageBusiness"],
  Corporate: ["showCorporateLedger", "showCorporateLoanApp", "showCorporateCSR", "showInvestorRelations"],
};

/** The other public pages: information, footer and application pages that belong to no one section. */
export const OTHER_SITE_PAGES: readonly string[] = [
  "selectorOpen", "showContactUs", "showAboutVINK", "showCareers", "showSwitchToVINK", "showSafetySecurity", "showTaxiAssociations", "showJobApp",
  "showLegal", "showBranchLocator", "showSponsorship", "showBankingFees", "showBankingGuide", "showBankingChannels", "showExchangeRates", "showLatestOffers", "showMarketIndices", "showVinkBlog",
];

/** Signed-in tools and previews, which keep their own layout. Listed so that every page the website can open is accounted for. */
export const APP_PAGES: readonly string[] = [
  "showPostLogin", "showUserProfile", "showOwners", "showInvestors", "showSuperAdmin", "showBanking", "showDriveDashboard", "showOwnerDashboard", "showTaxiAssociationDashboard",
  "showTerminalManagement", "showControlCentre", "showInvestorDashboard", "showManagementPanel", "showTokenReader", "showSIMApp", "showAFCApp", "showVinkBankingApp",
  "showVinkBusinessBankingApp", "showVinkCorporateBankingApp", "showVinkMobileApp", "showAppLauncher", "showRevenueDashboard", "showGlobalBanking", "showFinancialReports",
  "showAdminDashboard", "showAFCDashboard", "showAdminApps", "showCardNetwork", "showManagementHub", "showLogin", "showManshya", "showManshyaAdmin", "showManshyaPay",
];

export interface SiteChrome { section: SiteSection | null; showNav: boolean }

/** open: the page flags of the App, by name, true for the pages that are open. */
export function siteChrome(open: Readonly<Record<string, boolean>>): SiteChrome {
  const section = (Object.keys(SECTION_PAGES) as SiteSection[]).find((s) => SECTION_PAGES[s].some((k) => open[k])) ?? null;
  return { section, showNav: section !== null || OTHER_SITE_PAGES.some((k) => open[k]) };
}
