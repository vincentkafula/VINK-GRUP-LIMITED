/**
 * The one main sign-in. Every "Sign in" on the site calls this, so wherever a visitor is, clicking it brings up the same sign-in page
 * (the site header listens for the event). A page that sits on top of the site closes itself first, so the sign-in is not hidden behind it.
 */
export const openSignIn = (closeThisPage?: () => void) => {
  closeThisPage?.();
  window.dispatchEvent(new Event("vink:open-login"));
};
