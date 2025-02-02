/**
 * This is the application's entry point. It serves two purposes:
 *
 *   1. Capture all errors from the application and handle them properly.
 *   2. Start the application once everything has been set up.
 *
 * Keep this as simple as possible to prevent errors from getting past our handlers.
 */
import './reset.css';
import './global.css';
import AppSignal from '@appsignal/javascript';
import { relaunch } from '@tauri-apps/api/process';
import { config } from '@/config';
import { fromThrown } from '@/utils/error';

const appSignal =
  config.APP_SIGNAL_KEY != null ? new AppSignal({ key: config.APP_SIGNAL_KEY }) : undefined;
// React throws several times in short succession, we only want to handle the last error.
const debouncedErrorHandler = debounce(handleError, 100);

window.addEventListener('error', (evt) => debouncedErrorHandler(evt.error));
window.addEventListener('unhandledrejection', (evt) => debouncedErrorHandler(evt.reason));

// WebKit doesn't handle top-level await errors correctly, so we try/catch here
// See https://bugs.webkit.org/show_bug.cgi?id=258662
try {
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element (#root) not found, could not render.');
  const { render } = await import('@/ui/App');
  await render(container);
} catch (err) {
  debouncedErrorHandler(err);
}

// -------------------------------------------------------------------------------------------------

/**
 * Handle thrown errors of possibly unknown origin.
 *
 *   - Parses the errors to ensure we have a proper Error instance at hand.
 *   - Logs the error.
 *   - Renders a fallback screen.
 */
function handleError(thrown: unknown) {
  const error = fromThrown(thrown);
  logError(error);
  renderError(error);
}

/**
 * Log the error for debugging purposes.
 */
function logError(error: Error) {
  void appSignal?.sendError(error);
}

/**
 * When all else fails, we render an error message as a last resort after a fatal error.
 *
 * We use pure HTML intentionally, because React might not be available at this point, as
 * the application has crashed.
 */
function renderError({ message, stack }: Error) {
  document.body.innerHTML = `<div id="root">
  <div class="fatal-error">
    <svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 512 512">
      <!--! Font Awesome Free 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. -->
      <path fill="currentColor" d="M256 0c53 0 96 43 96 96v3.6c0 15.7-12.7 28.4-28.4 28.4H188.4c-15.7 0-28.4-12.7-28.4-28.4V96c0-53 43-96 96-96zM41.4 105.4c12.5-12.5 32.8-12.5 45.3 0l64 64c.7 .7 1.3 1.4 1.9 2.1c14.2-7.3 30.4-11.4 47.5-11.4H312c17.1 0 33.2 4.1 47.5 11.4c.6-.7 1.2-1.4 1.9-2.1l64-64c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3l-64 64c-.7 .7-1.4 1.3-2.1 1.9c6.2 12 10.1 25.3 11.1 39.5H480c17.7 0 32 14.3 32 32s-14.3 32-32 32H416c0 24.6-5.5 47.8-15.4 68.6c2.2 1.3 4.2 2.9 6 4.8l64 64c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0l-63.1-63.1c-24.5 21.8-55.8 36.2-90.3 39.6V240c0-8.8-7.2-16-16-16s-16 7.2-16 16V479.2c-34.5-3.4-65.8-17.8-90.3-39.6L86.6 502.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l64-64c1.9-1.9 3.9-3.4 6-4.8C101.5 367.8 96 344.6 96 320H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H96.3c1.1-14.1 5-27.5 11.1-39.5c-.7-.6-1.4-1.2-2.1-1.9l-64-64c-12.5-12.5-12.5-32.8 0-45.3z"/>
    </svg>
    <h1>Code Expert Sync crashed</h1>
    <h2>Should the issue persist, please get in touch.</h2>
    <div class="button-group">
      <a href="https://docs.expert.ethz.ch/Contact-6d83eed1a848489f84ee9c008c597259" target="_blank">Contact support</a>
      <button id="relaunch">Reload</button>
    </div>
    <details>
      <summary>Show error details</summary>
      <div>
        <h3>Message</h3>
        <p>${message}</p>
        <h3>Stack trace</h3>
        <pre><code>${stack ?? 'No stack trace available.'}</code></pre>
      </div>
    </details>
  </div>
</div>`;
  document.getElementById('relaunch')?.addEventListener('click', relaunch);
}

/**
 * Debounce a function so that if it is called repeatedly in short succession,
 * only run it if a wait time since the last call has passed.
 */
function debounce<A extends Array<unknown>>(callback: (...args: A) => unknown, wait: number) {
  let timeout: number | undefined;
  return (...args: A) => {
    const next = () => callback(...args);
    window.clearTimeout(timeout);
    timeout = window.setTimeout(next, wait);
  };
}
