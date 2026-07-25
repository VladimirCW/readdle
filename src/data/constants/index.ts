/** API endpoint paths (relative to the API base URL). */
export const ENDPOINTS = {
    signup: '/api/auth/signup',
    confirm: '/api/auth/confirm',
    signin: '/api/auth/signin',
    me: '/api/auth/me',
    notes: '/api/notes',
    docJson: '/api/doc.json',
} as const;

/** Business/validation error messages returned by the API (healthy mode). */
export const ERROR_MESSAGES = {
    userExists: 'User already exists.',
    invalidEmail: 'Invalid email format.',
    emailRequired: 'Email is required.',
    passwordRequired: 'Password is required.',
    passwordTooShort: 'Password must be at least 8 characters.',
    passwordTooLong: 'Password is too long.',
    emailTooLong: 'Email is too long.',
    invalidJson: 'Invalid JSON payload.',
    invalidOrExpiredCode: 'Invalid or expired confirmation code.',
    userNotFound: 'User not found.',
    codeSixDigits: 'Confirmation code must be exactly 6 digits.',
    invalidCredentials: 'Invalid credentials.',
    emailNotConfirmed: 'Email is not confirmed.',
} as const;

/** Success messages returned by the API (healthy mode). */
export const SUCCESS_MESSAGES = {
    signup: 'Confirmation code sent to email.',
    confirm: 'Account confirmed.',
} as const;

/** SPA routes and localStorage token key used by the frontend. */
export const UI = {
    tokenKey: 'qa_task_token',
    paths: {
        root: '/',
        notes: '/account/notes',
        profile: '/account/profile',
    },
} as const;

/** User-visible status messages shown by the SPA (#status). */
export const UI_MESSAGES = {
    signedIn: 'Signed in.',
    loggedOut: 'Logged out.',
    accountConfirmed: 'Account confirmed.',
    noteCreated: 'Note created.',
    noteUpdated: 'Note updated.',
    noteDeleted: 'Note deleted.',
    signUpSent: 'Sign up request sent',
    noNotesFound: 'No notes found.',
    invalidCredentials: 'Invalid credentials.',
} as const;

/** Validation limits enforced by the backend. */
export const LIMITS = {
    passwordMin: 8,
    passwordMax: 255,
    emailMax: 190,
    titleMax: 255,
    contentMax: 10_000,
    notesItemsPerPageMax: 50,
} as const;
