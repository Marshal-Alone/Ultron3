// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

// Suppress external monitoring tool errors (mgt.clearMarks not a function)
// This error comes from performance monitoring libraries/extensions, not our code
if (typeof window !== 'undefined') {
    const originalError = window.onerror;
    window.onerror = function(message, source, lineno, colno, error) {
        // Suppress the "mgt.clearMarks is not a function" error from external tools
        if (message && message.includes('mgt.clearMarks')) {
            console.debug('ℹ️ Suppressed external monitoring error (mgt.clearMarks)');
            return true; // Prevent error from propagating
        }
        // Let other errors through
        if (originalError) {
            return originalError(message, source, lineno, colno, error);
        }
    };
}
