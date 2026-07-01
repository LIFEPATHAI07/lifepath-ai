// lib/profile.js
//
// Core shape of a LifePath AI user profile.
// This is the "internal profile object" required by the spec — it is
// never rendered directly to the user, only used to personalize AI context.

// Allowed values for currentStatus (kept as plain strings since this is JS).
export const CURRENT_STATUS_OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'job_seeker', label: 'Job Seeker' },
  { value: 'employed', label: 'Employed' },
  { value: 'business_owner', label: 'Business Owner' },
  { value: 'other', label: 'Other' },
];

// The gradual onboarding questions, in the exact order they should be asked.
// Order matters: the onboarding flow walks through this list one field at a time.
export const ONBOARDING_FIELD_ORDER = [
  'name',
  'country',
  'state',
  'city',
  'education',
  'currentStatus',
  'biggestGoal',
  'biggestProblem',
  'skills',
  'availableTimeDaily',
];

// Fields the user is explicitly allowed to skip.
export const OPTIONAL_FIELDS = ['city'];

// Question copy shown in the onboarding UI, keyed by field name.
// Kept here (not in the component) so page.js and OnboardingFlow.js
// can both reference the same source of truth.
export const QUESTION_COPY = {
  name: 'What should I call you?',
  country: 'Which country are you in?',
  state: 'Which state?',
  city: 'Which city? (optional — you can skip this)',
  education: "What's your education background?",
  currentStatus: 'Which best describes you right now?',
  biggestGoal: "What's the biggest goal you're working toward?",
  biggestProblem: "What's the biggest problem standing in your way right now?",
  skills: 'What skills do you already have?',
  availableTimeDaily: 'How much time can you realistically give this each day?',
};

// Fresh, empty profile for a brand-new userId.
// No field is ever pre-filled or guessed — every value starts as null,
// per the "never assume user information" rule.
export function createEmptyProfile(userId) {
  const now = Date.now();
  return {
    userId,
    name: null,
    country: null,
    state: null,
    city: null,
    education: null,
    currentStatus: null,
    biggestGoal: null,
    biggestProblem: null,
    skills: null,
    availableTimeDaily: null,
    onboardingComplete: false,
    onboardingStep: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// A profile is "done" once every non-optional field is filled in.
export function isProfileComplete(profile) {
  return ONBOARDING_FIELD_ORDER.every((field) => {
    if (OPTIONAL_FIELDS.includes(field)) return true;
    const value = profile[field];
    return value !== null && value !== undefined && value !== '';
  });
}
