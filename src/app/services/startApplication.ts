/**
 * Opens the application form. Every "Start Now" on the site calls this; the App listens and shows the form over whatever page is open.
 */
export const startApplication = () => window.dispatchEvent(new Event("vink:start-application"));
